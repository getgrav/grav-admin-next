/**
 * Optional editor keybindings (admin2#95).
 *
 * The vim extension is code-split into its own chunk and only fetched when a
 * user actually selects the `vim` keymap in preferences, so non-vim users pay
 * zero bundle cost. Because CodeMirror's `getExtensions()` builders are
 * synchronous, the module is preloaded via `ensureKeymapLoaded()` before the
 * editor is (re)created, then read synchronously by `keymapExtension()`.
 */
import type { Extension } from '@codemirror/state';
import type { EditorKeymap } from '$lib/stores/preferences.svelte';

type VimModule = typeof import('@replit/codemirror-vim');

let vimMod: VimModule | null = null;
let vimLoad: Promise<VimModule> | null = null;

/**
 * Preload the module a keymap needs, if any. Idempotent — the dynamic import
 * runs at most once per session and concurrent callers share the promise.
 * Call this and await it before building extensions.
 */
export async function ensureKeymapLoaded(keymap: EditorKeymap): Promise<void> {
	if (keymap !== 'vim' || vimMod) return;
	try {
		vimLoad ??= import('@replit/codemirror-vim');
		vimMod = await vimLoad;
		defineExCommands(vimMod);
	} catch {
		// Chunk failed to load (offline / blocked) — fall back to default
		// keybindings rather than leaving the editor unusable.
		vimMod = null;
		vimLoad = null;
	}
}

let exDefined = false;

/**
 * Wire the familiar `:w` / `:q` ex-commands to the host's save/close. The
 * editor components are generic and don't own "save the page", so each command
 * dispatches a window event on the existing `grav:editor:*` bus; the route that
 * owns the action (e.g. the page editor) listens and acts. On routes with no
 * listener the command is a harmless no-op. Registered once per session — the
 * Vim object is a module-level singleton shared by every editor instance.
 */
function defineExCommands(mod: VimModule): void {
	if (exDefined) return;
	exDefined = true;
	const { Vim } = mod;
	const emit = (name: string) => {
		if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name));
	};
	const save = () => emit('grav:editor:save');
	const close = () => emit('grav:editor:close');
	Vim.defineEx('write', 'w', save); //            :w  / :write
	Vim.defineEx('quit', 'q', close); //            :q  / :quit
	Vim.defineEx('wq', 'wq', () => { save(); close(); }); // :wq
	Vim.defineEx('xit', 'x', () => { save(); close(); }); // :x  / :xit
}

/**
 * The keymap extension for the given preference. MUST be placed FIRST in the
 * extensions array so vim intercepts keys ahead of the default keymap. Returns
 * an empty extension for `default`, or when the vim chunk hasn't loaded yet.
 */
export function keymapExtension(keymap: EditorKeymap): Extension {
	return keymap === 'vim' && vimMod ? vimMod.vim() : [];
}
