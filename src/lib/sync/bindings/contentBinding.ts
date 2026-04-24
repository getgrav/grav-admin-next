/**
 * Minimal bidirectional binding between a Svelte string (`content` in the
 * page editor) and a Yjs Y.Text shape.
 *
 * Strategy: diff-based. When local content changes, find the common prefix
 * and suffix with the Y.Text's current value and apply a single
 * delete+insert. This is correct under concurrent edits because Yjs's
 * operational transform handles concurrent inserts at overlapping positions.
 *
 * Not as good as a proper editor binding (y-codemirror.next / y-prosemirror)
 * — those track granular keystrokes. But it's correct for a <textarea>-style
 * fallback and buys us Phase 3 without touching editor-pro (that's Phase 6).
 */

import type * as Y from 'yjs';
import type { YDocManager } from '../YDocManager';
import { ORIGIN_REMOTE } from '../YDocManager';

export interface ContentBinding {
	/** Call when the local content string changes (user typed, paste, etc.). */
	pushLocal(newValue: string): void;
	/** Subscribe to remote changes. Returns unsubscribe. */
	onRemote(handler: (value: string) => void): () => void;
	/** Current Y.Text value. */
	getValue(): string;
	/** Replace the doc contents wholesale — used for initial seed only. */
	seed(initialValue: string): void;
	dispose(): void;
}

export function createContentBinding(mgr: YDocManager): ContentBinding {
	const ytext: Y.Text = mgr.content;
	const handlers = new Set<(value: string) => void>();
	let lastSeen = ytext.toString();

	const observer = (_evt: Y.YTextEvent, tx: Y.Transaction) => {
		// Only notify on remote/foreign-origin changes; our local pushLocal
		// path doesn't need to echo back to itself.
		const origin = tx.origin;
		if (origin === mgr.localOrigin) return;
		const current = ytext.toString();
		if (current === lastSeen) return;
		lastSeen = current;
		for (const h of handlers) h(current);
	};
	ytext.observe(observer);

	function pushLocal(newValue: string): void {
		const oldValue = ytext.toString();
		if (oldValue === newValue) return;

		let prefix = 0;
		const minLen = Math.min(oldValue.length, newValue.length);
		while (prefix < minLen && oldValue[prefix] === newValue[prefix]) prefix++;

		let suffix = 0;
		while (
			suffix < oldValue.length - prefix &&
			suffix < newValue.length - prefix &&
			oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
		) {
			suffix++;
		}

		const deleteLen = oldValue.length - prefix - suffix;
		const insertStr = newValue.slice(prefix, newValue.length - suffix);

		mgr.doc.transact(() => {
			if (deleteLen > 0) ytext.delete(prefix, deleteLen);
			if (insertStr.length > 0) ytext.insert(prefix, insertStr);
		}, mgr.localOrigin);

		lastSeen = ytext.toString();
	}

	function onRemote(handler: (value: string) => void): () => void {
		handlers.add(handler);
		return () => handlers.delete(handler);
	}

	function seed(initialValue: string): void {
		if (ytext.length > 0) return; // doc already has content, don't clobber
		mgr.doc.transact(() => {
			ytext.insert(0, initialValue);
		}, ORIGIN_REMOTE); // seed counts as non-local so it doesn't push
		lastSeen = ytext.toString();
	}

	function dispose(): void {
		ytext.unobserve(observer);
		handlers.clear();
	}

	return { pushLocal, onRemote, getValue: () => ytext.toString(), seed, dispose };
}
