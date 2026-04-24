import { getContext, setContext } from 'svelte';

/**
 * Bus for "the containing form just saved successfully" events.
 *
 * Leaf blueprint fields can register side effects that should only run once
 * the user has committed their edits — the canonical case is `FileField`
 * deleting removed files from disk. Firing those deletes on every ✕ click
 * leaves orphan state if the user reloads without saving (YAML still
 * references the file, but the file is already gone). Deferring to save
 * keeps on-disk state and the stored config in lockstep.
 *
 * The pattern is a minimal pub/sub rather than Svelte stores so that
 * callbacks see the most recent closure (their captured state) at the
 * moment save actually resolves.
 */
const CONTEXT_KEY = 'formCommit';

export interface FormCommitBus {
	register(callback: () => void | Promise<void>): () => void;
	emit(): Promise<void>;
}

export function createFormCommitBus(): FormCommitBus {
	const listeners = new Set<() => void | Promise<void>>();
	return {
		register(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		async emit() {
			// Snapshot + clear before awaiting so a listener that re-registers
			// during its own run (e.g. after another mutation) doesn't fire
			// twice on this commit cycle.
			const snapshot = [...listeners];
			for (const cb of snapshot) {
				try {
					await cb();
				} catch (err) {
					console.warn('[formCommit] listener threw:', err);
				}
			}
		},
	};
}

/** Set up a commit bus for this form's children to register against. */
export function provideFormCommit(): FormCommitBus {
	const bus = createFormCommitBus();
	setContext(CONTEXT_KEY, bus);
	return bus;
}

/** Retrieve the enclosing form's commit bus, or `null` if there isn't one. */
export function useFormCommit(): FormCommitBus | null {
	return getContext<FormCommitBus | undefined>(CONTEXT_KEY) ?? null;
}
