import { prefs } from '$lib/stores/preferences.svelte';
import { toast } from 'svelte-sonner';

export interface UndoEntry {
	id: number;
	path: string;
	oldValue: unknown;
	newValue: unknown;
	timestamp: number;
	label: string;
	savedToServer: boolean;
}

export interface AutoSaveManagerOptions {
	/** Function to perform the actual save to the server */
	save: () => Promise<void>;
	/** Function to get the current value at a given data path */
	getValue: (path: string) => unknown;
	/** Function to apply a value change (e.g. handleBlueprintChange) */
	applyChange: (path: string, value: unknown) => void;
	/** Human-readable form name for toast messages */
	formName?: string;
}

export interface AutoSaveManager {
	readonly undoStack: UndoEntry[];
	readonly canUndo: boolean;
	readonly saving: boolean;
	readonly lastSavedAt: number | null;
	oncommit: (path: string, value: unknown, oldValue?: unknown) => void;
	undo: () => void;
	forceSave: () => Promise<void>;
	reset: () => void;
}

export function createAutoSaveManager(options: AutoSaveManagerOptions): AutoSaveManager {
	const { save, getValue, applyChange, formName = 'Form' } = options;

	let undoStack = $state<UndoEntry[]>([]);
	let saving = $state(false);
	let lastSavedAt = $state<number | null>(null);
	let nextId = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let batchTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingBatchEntries: UndoEntry[] = [];

	const canUndo = $derived(undoStack.length > 0);

	async function executeSave() {
		if (saving) return;
		saving = true;
		try {
			await save();
			lastSavedAt = Date.now();
			// Mark all unsaved entries as saved
			undoStack = undoStack.map(e =>
				e.savedToServer ? e : { ...e, savedToServer: true }
			);
		} catch {
			toast.error(`Failed to save ${formName}`);
		} finally {
			saving = false;
		}
	}

	function scheduleSave() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			executeSave();
		}, 500);
	}

	function oncommit(path: string, value: unknown, oldValue?: unknown) {
		if (!prefs.autoSaveEnabled) return;

		// Use provided oldValue (blur-commit), or fall back to getValue
		// (works for immediate-commit where oncommit fires before onchange)
		const old = oldValue !== undefined ? oldValue : getValue(path);
		// Skip if value hasn't actually changed
		if (JSON.stringify(old) === JSON.stringify(value)) return;

		const entry: UndoEntry = {
			id: nextId++,
			path,
			oldValue: JSON.parse(JSON.stringify(old)),
			newValue: JSON.parse(JSON.stringify(value)),
			timestamp: Date.now(),
			label: `Changed ${humanizePath(path)}`,
			savedToServer: false,
		};

		const batchWindow = prefs.autoSaveBatchWindowMs;
		if (batchWindow > 0) {
			pendingBatchEntries.push(entry);
			if (batchTimer) clearTimeout(batchTimer);
			batchTimer = setTimeout(() => {
				undoStack = [...undoStack, ...pendingBatchEntries].slice(-50);
				pendingBatchEntries = [];
				batchTimer = null;
				scheduleSave();
			}, batchWindow);
		} else {
			undoStack = [...undoStack, entry].slice(-50);
			scheduleSave();
		}
	}

	function undo() {
		if (undoStack.length === 0) return;

		const lastEntry = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);

		// Apply the old value back
		applyChange(lastEntry.path, lastEntry.oldValue);

		// If the undone entry was already saved to server, trigger a re-save
		if (lastEntry.savedToServer) {
			scheduleSave();
		}

		toast.info(`Undone: ${lastEntry.label}`, {
			duration: 2000,
		});
	}

	async function forceSave() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		// Flush any pending batch entries
		if (pendingBatchEntries.length > 0) {
			undoStack = [...undoStack, ...pendingBatchEntries].slice(-50);
			pendingBatchEntries = [];
			if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
		}
		await executeSave();
	}

	function reset() {
		undoStack = [];
		if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
		if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
		pendingBatchEntries = [];
		lastSavedAt = null;
	}

	return {
		get undoStack() { return undoStack; },
		get canUndo() { return canUndo; },
		get saving() { return saving; },
		get lastSavedAt() { return lastSavedAt; },
		oncommit,
		undo,
		forceSave,
		reset,
	};
}

/** Turn a dot-path like "header.taxonomy.tag" into "taxonomy > tag" */
function humanizePath(path: string): string {
	const parts = path.split('.');
	// Strip common prefixes
	if (parts[0] === 'header' && parts.length > 1) parts.shift();
	return parts.join(' > ');
}
