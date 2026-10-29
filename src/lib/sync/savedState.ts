/**
 * Keeps a collaboration room in step with the page file on disk.
 *
 * A room outlives the editing session: the sync plugin keeps its update log
 * until the room has been idle for 30 days, and saving a page only broadcasts a
 * "page-saved" notice; nothing on the server writes the saved file back into
 * the room. So an edit made to the page file outside the admin (git-sync pull,
 * a text editor, an API write from elsewhere) never reached an existing room:
 * the editors showed the room's older text, and the next save wrote it back
 * over the file.
 *
 * The room therefore records what the page file held at the last save (or
 * seed) in its own root map, `saved`, which FormBinding's seed-or-adopt check
 * on the `form` map never looks at:
 *   - `content`: a hash of the markdown body
 *   - `header`:  the frontmatter, as JSON (small, and compared key by key)
 *
 * On connect, the room is compared with the page as just loaded from the
 * server, three ways against that marker:
 *   - room == saved, disk != saved: no unsaved edits, the file changed: the
 *     room adopts the file.
 *   - room != saved, disk == saved: unsaved edits, the file is unchanged: keep.
 *   - both moved: unsaved edits AND a changed file. The room is kept (unsaved
 *     work wins) and the editor warns; nothing is merged or dropped silently.
 *
 * The header is compared per top-level key, so a frontmatter key changed on
 * disk is adopted even while another key, or the content, has unsaved edits.
 * It needs this as much as the content: Normal mode saves the room's `title`
 * and Expert mode saves the whole header it shows, so a stale room header
 * overwrote frontmatter edits made on disk just like a stale body did. Folder
 * settings (folder, parent, order) are always taken from disk already, and the
 * template is part of the room id, so neither needs a marker.
 */

import * as Y from 'yjs';
import { applyTextDiff, serializeY, toYValue } from './bindings/formBinding.ts';

export const SAVED_MAP = 'saved';

export interface DiskState {
	content: string;
	/** The page header with `title`, as the editor holds it in `form.header`. */
	header: Record<string, unknown>;
}

/** cyrb53: a fast 53-bit string hash. Plenty for telling two texts apart. */
function cyrb53(str: string, seed = 0): number {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Content compared for "has it changed": surrounding whitespace ignored. Editor
 * Pro writes the markdown back without the file's trailing newline as soon as
 * it mounts; counting that as an unsaved edit would turn every later disk
 * change in a room Editor Pro has opened into a conflict instead of adopting it.
 */
function comparable(s: string): string {
	return s.trim();
}

export function contentHash(s: string): string {
	const c = comparable(s);
	return `${c.length}:${cyrb53(c).toString(36)}`;
}

/** JSON with object keys sorted, so equal values always compare equal. */
export function stableJson(v: unknown): string {
	if (v === undefined) return 'undefined';
	return JSON.stringify(v, (_k, val) => {
		if (val && typeof val === 'object' && !Array.isArray(val)) {
			const out: Record<string, unknown> = {};
			for (const k of Object.keys(val).sort()) out[k] = (val as Record<string, unknown>)[k];
			return out;
		}
		return val;
	});
}

/**
 * - `same`: the room already matches the file.
 * - `adopt`: no unsaved edits since the last save, and the file changed.
 * - `keep`: unsaved edits, and the file hasn't changed since the last save.
 * - `conflict`: unsaved edits and a changed file, or a room from before the
 *   marker existed that differs from the file (it can't tell which side moved).
 */
export type Decision = 'same' | 'adopt' | 'keep' | 'conflict';

export function decideContent(room: string, disk: string, savedHash: string | undefined): Decision {
	if (comparable(room) === comparable(disk)) return 'same';
	if (savedHash === undefined) return 'conflict';
	if (contentHash(room) === savedHash) return 'adopt';
	if (contentHash(disk) === savedHash) return 'keep';
	return 'conflict';
}

export interface HeaderMerge {
	/** Keys to take from the file (`undefined` removes the key). */
	adopt: Record<string, unknown>;
	/** Keys changed in the room and differently on disk; the room's value is kept. */
	conflicts: string[];
	/** The marker to record: the file's value, except where a conflict is unresolved. */
	nextSaved: Record<string, unknown>;
}

/**
 * Three-way merge of the header, per top-level key. A room without a marker
 * (from before this existed) is left alone and reports no conflicts: fields
 * write their defaults into the room when they mount, so a header difference
 * there says nothing about the file.
 */
export function mergeHeader(
	room: Record<string, unknown>,
	disk: Record<string, unknown>,
	saved: Record<string, unknown> | undefined,
): HeaderMerge {
	const result: HeaderMerge = { adopt: {}, conflicts: [], nextSaved: { ...disk } };
	if (!saved) return result;
	const keys = new Set([...Object.keys(room), ...Object.keys(disk), ...Object.keys(saved)]);
	for (const k of keys) {
		const r = stableJson(room[k]);
		const d = stableJson(disk[k]);
		const s = stableJson(saved[k]);
		if (r === d) continue;
		if (r === s) {
			result.adopt[k] = disk[k];
		} else if (d !== s) {
			result.conflicts.push(k);
			if (saved[k] === undefined) delete result.nextSaved[k];
			else result.nextSaved[k] = saved[k];
		}
	}
	return result;
}

function readSaved(doc: Y.Doc): { content?: string; header?: Record<string, unknown> } {
	const saved = doc.getMap<string>(SAVED_MAP);
	const content = saved.get('content');
	let header: Record<string, unknown> | undefined;
	const raw = saved.get('header');
	if (typeof raw === 'string') {
		try { header = JSON.parse(raw) as Record<string, unknown>; } catch { header = undefined; }
	}
	return { content: typeof content === 'string' ? content : undefined, header };
}

function writeSaved(saved: Y.Map<string>, disk: { contentHash?: string; header: Record<string, unknown> }): void {
	if (disk.contentHash !== undefined && saved.get('content') !== disk.contentHash) saved.set('content', disk.contentHash);
	const header = stableJson(disk.header);
	if (saved.get('header') !== header) saved.set('header', header);
}

/**
 * Record the file as just saved (or seeded) in the room. Writes nothing when
 * the marker already says so, so opening and saving don't grow the room log.
 */
export function markSaved(doc: Y.Doc, disk: DiskState, origin?: unknown): void {
	doc.transact(() => {
		writeSaved(doc.getMap<string>(SAVED_MAP), { contentHash: contentHash(disk.content), header: disk.header });
	}, origin);
}

/**
 * After a save: record the page as saved, and bring into the room any header
 * key the save changed that the room still holds at its previous saved value.
 * That's how frontmatter saved from Expert mode, which never goes through the
 * room, reaches it (and the peers in it); left out, the room's older value
 * would count as an unsaved edit and win on the next open. The content needs
 * no such step: it is saved from the room's own text.
 */
export function recordSave(doc: Y.Doc, disk: DiskState, isText: (path: string) => boolean, origin?: unknown): void {
	const form = doc.getMap<unknown>('form');
	const previous = readSaved(doc).header;
	const roomHeaderRaw = serializeY(form.get('header'));
	const roomHeader = (roomHeaderRaw && typeof roomHeaderRaw === 'object' && !Array.isArray(roomHeaderRaw))
		? roomHeaderRaw as Record<string, unknown>
		: {};
	const { adopt } = mergeHeader(roomHeader, disk.header, previous);
	doc.transact(() => {
		const keys = Object.keys(adopt);
		const header = form.get('header');
		if (keys.length > 0 && header instanceof Y.Map) {
			for (const k of keys) {
				if (adopt[k] === undefined) header.delete(k);
				else header.set(k, toYValue(adopt[k], `header.${k}`, isText));
			}
		}
		writeSaved(doc.getMap<string>(SAVED_MAP), { contentHash: contentHash(disk.content), header: disk.header });
	}, origin);
}

export interface ReconcileResult {
	content: Decision;
	headerConflicts: string[];
	/** Whether the room was written to. */
	changed: boolean;
}

/**
 * Compare a connected room with the page as loaded from the server and adopt
 * the file wherever the room has no unsaved edits (see the top of this file).
 *
 * The writes are built in a scratch doc whose Yjs client id is derived from
 * the inputs. Two editors opening the page at the same moment both decide to
 * adopt the same file into the same room; with the same client id, clock and
 * neighbours their updates are identical, and Yjs applies the second one as a
 * no-op instead of inserting the file's text twice.
 */
export function reconcileWithDisk(
	doc: Y.Doc,
	disk: DiskState,
	isText: (path: string) => boolean,
	origin?: unknown,
): ReconcileResult {
	const form = doc.getMap<unknown>('form');
	const roomText = form.get('content');
	const roomContent = roomText instanceof Y.Text ? roomText.toString() : (typeof roomText === 'string' ? roomText : '');
	const roomHeaderRaw = serializeY(form.get('header'));
	const roomHeader = (roomHeaderRaw && typeof roomHeaderRaw === 'object' && !Array.isArray(roomHeaderRaw))
		? roomHeaderRaw as Record<string, unknown>
		: {};
	const saved = readSaved(doc);

	const content = decideContent(roomContent, disk.content, saved.content);
	const header = mergeHeader(roomHeader, disk.header, saved.header);
	const nextContentHash = content === 'conflict' || content === 'keep' ? saved.content : contentHash(disk.content);
	const nextHeader = saved.header ? header.nextSaved : disk.header;

	const savedMap = doc.getMap<string>(SAVED_MAP);
	const adoptKeys = Object.keys(header.adopt);
	const markerChanges = (nextContentHash !== undefined && savedMap.get('content') !== nextContentHash)
		|| savedMap.get('header') !== stableJson(nextHeader);
	if (content !== 'adopt' && adoptKeys.length === 0 && !markerChanges) {
		return { content, headerConflicts: header.conflicts, changed: false };
	}

	const scratch = new Y.Doc();
	Y.applyUpdate(scratch, Y.encodeStateAsUpdate(doc));
	// Only now: Yjs gives a doc a new client id if an applied update already
	// carries its own, which would happen here when an earlier identical
	// adoption is in the log.
	scratch.clientID = (cyrb53(stableJson([roomContent, roomHeader, saved, disk])) % 4294967295) + 1;
	scratch.transact(() => {
		const sForm = scratch.getMap<unknown>('form');
		if (content === 'adopt') {
			let text = sForm.get('content');
			if (!(text instanceof Y.Text)) {
				text = new Y.Text();
				sForm.set('content', text);
			}
			applyTextDiff(text as Y.Text, disk.content);
		}
		if (adoptKeys.length > 0) {
			let sHeader = sForm.get('header');
			if (!(sHeader instanceof Y.Map)) {
				sHeader = new Y.Map<unknown>();
				sForm.set('header', sHeader);
			}
			for (const k of adoptKeys) {
				const v = header.adopt[k];
				if (v === undefined) (sHeader as Y.Map<unknown>).delete(k);
				else (sHeader as Y.Map<unknown>).set(k, toYValue(v, `header.${k}`, isText));
			}
		}
		writeSaved(scratch.getMap<string>(SAVED_MAP), { contentHash: nextContentHash, header: nextHeader });
	});
	const update = Y.encodeStateAsUpdate(scratch, Y.encodeStateVector(doc));
	scratch.destroy();
	Y.applyUpdate(doc, update, origin);
	return { content, headerConflicts: header.conflicts, changed: true };
}
