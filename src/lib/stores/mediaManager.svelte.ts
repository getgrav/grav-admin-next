import {
	getSiteMedia,
	deleteSiteMedia,
	createFolder as apiCreateFolder,
	deleteFolder as apiDeleteFolder,
	renameSiteMedia as apiRenameSiteMedia,
	renameFolder as apiRenameFolder,
	setSiteMediaOrder,
	type MediaItem,
	type FolderInfo,
	type Pagination,
} from '$lib/api/endpoints/media';
import { prefs } from './preferences.svelte';
import type { MediaViewMode } from './preferences.svelte';

// 'manual' preserves the folder's saved order (media_order.yaml) — the order
// the API returns — instead of applying a client-side sort.
export type SortField = 'name' | 'size' | 'modified' | 'type' | 'manual';
export type SortOrder = 'asc' | 'desc';
export type TypeFilter = '' | 'image' | 'video' | 'audio' | 'document';

function createMediaManagerStore() {
	// Navigation
	let currentPath = $state('');
	let files = $state<MediaItem[]>([]);
	let folders = $state<FolderInfo[]>([]);
	let loading = $state(false);
	let pagination = $state<Pagination>({ page: 1, per_page: 100, total: 0, total_pages: 0 });

	// Selection
	let selectedFiles = $state<Set<string>>(new Set());
	let lastSelectedIndex = $state(-1);
	let inspectedFile = $state<MediaItem | null>(null);

	// View
	let sortField = $state<SortField>('name');
	let sortOrder = $state<SortOrder>('asc');

	// Search/filter
	let searchQuery = $state('');
	let typeFilter = $state<TypeFilter>('');
	let isSearching = $state(false);

	// Race condition guard
	let generation = 0;

	// Derived: all items sorted (folders first, then files)
	const sortedFiles = $derived.by(() => {
		// Manual mode keeps the server-provided order (saved media_order.yaml).
		if (sortField === 'manual') return [...files];
		const sorted = [...files];
		sorted.sort((a, b) => {
			let cmp = 0;
			switch (sortField) {
				case 'name':
					cmp = a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' });
					break;
				case 'size':
					cmp = a.size - b.size;
					break;
				case 'modified':
					cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime();
					break;
				case 'type':
					cmp = a.type.localeCompare(b.type);
					break;
			}
			return sortOrder === 'asc' ? cmp : -cmp;
		});
		return sorted;
	});

	async function loadFolder(path: string, gen: number, resetSort = false) {
		try {
			const result = await getSiteMedia({
				path: path || undefined,
				type: typeFilter || undefined,
				per_page: 200,
			});

			// Discard stale responses
			if (gen !== generation) return;

			files = result.items;
			folders = result.folders;
			pagination = result.pagination;
			isSearching = false;
			// On a fresh navigation, honor a saved manual order by default; drop
			// out of manual when the folder we just entered has none.
			if (resetSort) {
				if (result.ordered) sortField = 'manual';
				else if (sortField === 'manual') sortField = 'name';
			}
		} catch (err) {
			if (gen !== generation) return;
			console.error('[MediaManager] Failed to load folder:', err);
			files = [];
			folders = [];
		} finally {
			if (gen === generation) {
				loading = false;
			}
		}
	}

	async function doSearch(query: string, gen: number) {
		try {
			const result = await getSiteMedia({
				search: query,
				type: typeFilter || undefined,
				per_page: 200,
			});

			if (gen !== generation) return;

			files = result.items;
			folders = [];
			pagination = result.pagination;
			isSearching = true;
			// Cross-folder results have no single saved order to honor.
			if (sortField === 'manual') sortField = 'name';
		} catch (err) {
			if (gen !== generation) return;
			console.error('[MediaManager] Search failed:', err);
			files = [];
			folders = [];
		} finally {
			if (gen === generation) {
				loading = false;
			}
		}
	}

	return {
		// State getters
		get currentPath() { return currentPath; },
		get files() { return sortedFiles; },
		get folders() { return folders; },
		get loading() { return loading; },
		get pagination() { return pagination; },
		get selectedFiles() { return selectedFiles; },
		get inspectedFile() { return inspectedFile; },
		get sortField() { return sortField; },
		get sortOrder() { return sortOrder; },
		get searchQuery() { return searchQuery; },
		get typeFilter() { return typeFilter; },
		get isSearching() { return isSearching; },
		get lastSelectedIndex() { return lastSelectedIndex; },

		get viewMode(): MediaViewMode { return prefs.mediaViewMode; },
		set viewMode(v: MediaViewMode) { prefs.mediaViewMode = v; },

		// Navigation
		navigateTo(path: string) {
			currentPath = path;
			searchQuery = '';
			isSearching = false;
			selectedFiles = new Set();
			lastSelectedIndex = -1;
			inspectedFile = null;
			loading = true;
			const gen = ++generation;
			loadFolder(path, gen, true);
		},

		goUp() {
			if (isSearching) {
				searchQuery = '';
				isSearching = false;
				const gen = ++generation;
				loading = true;
				loadFolder(currentPath, gen);
				return;
			}
			if (!currentPath) return;
			const parts = currentPath.split('/');
			parts.pop();
			this.navigateTo(parts.join('/'));
		},

		refresh() {
			if (isSearching && searchQuery) {
				const gen = ++generation;
				loading = true;
				doSearch(searchQuery, gen);
			} else {
				const gen = ++generation;
				loading = true;
				loadFolder(currentPath, gen);
			}
		},

		search(query: string) {
			searchQuery = query;
			selectedFiles = new Set();
			lastSelectedIndex = -1;
			inspectedFile = null;

			if (!query || query.length < 2) {
				isSearching = false;
				const gen = ++generation;
				loading = true;
				loadFolder(currentPath, gen);
				return;
			}

			loading = true;
			const gen = ++generation;
			doSearch(query, gen);
		},

		setTypeFilter(filter: TypeFilter) {
			typeFilter = filter;
			this.refresh();
		},

		setSort(field: SortField) {
			// Manual order has no asc/desc — just switch into it.
			if (field === 'manual') {
				sortField = 'manual';
				return;
			}
			if (sortField === field) {
				sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
			} else {
				sortField = field;
				sortOrder = 'asc';
			}
		},

		// Files can be drag-reordered in any real folder (not a cross-folder
		// search result). Dragging while sorted by name/size/etc. is allowed and
		// switches the folder into custom order — see reorder().
		get canReorder() {
			return !isSearching;
		},

		/**
		 * Move a file from one position to another and persist the new order as
		 * the folder's `media_order.yaml`. Dragging implies custom order: if the
		 * folder is currently shown under a name/size/etc. sort, that visible
		 * order is baked in as the starting point and the sort switches to
		 * 'manual'. Optimistic — reverts via refresh() if the save fails.
		 */
		async reorder(fromIndex: number, toIndex: number): Promise<void> {
			if (isSearching) return;

			// Capture the order the user currently sees BEFORE switching modes,
			// so flipping out of a name/size sort doesn't snap to a different order.
			const current = [...sortedFiles];
			if (
				fromIndex < 0 || toIndex < 0 ||
				fromIndex >= current.length || toIndex >= current.length ||
				fromIndex === toIndex
			) {
				return;
			}

			if (sortField !== 'manual') sortField = 'manual';

			const [moved] = current.splice(fromIndex, 1);
			current.splice(toIndex, 0, moved);
			files = current;

			try {
				await setSiteMediaOrder(currentPath, current.map((f) => f.filename));
			} catch (err) {
				console.error('[MediaManager] Failed to save order:', err);
				this.refresh();
				throw err;
			}
		},

		// Selection
		select(file: MediaItem, index: number) {
			const key = file.path ? `${file.path}/${file.filename}` : file.filename;
			selectedFiles = new Set([key]);
			lastSelectedIndex = index;
			inspectedFile = file;
		},

		toggleSelect(file: MediaItem, index: number) {
			const key = file.path ? `${file.path}/${file.filename}` : file.filename;
			const next = new Set(selectedFiles);
			if (next.has(key)) {
				next.delete(key);
				if (inspectedFile?.filename === file.filename && inspectedFile?.path === file.path) {
					inspectedFile = null;
				}
			} else {
				next.add(key);
				inspectedFile = file;
			}
			selectedFiles = next;
			lastSelectedIndex = index;
		},

		selectRange(toIndex: number) {
			const from = Math.min(lastSelectedIndex, toIndex);
			const to = Math.max(lastSelectedIndex, toIndex);
			const next = new Set(selectedFiles);
			for (let i = from; i <= to; i++) {
				const f = sortedFiles[i];
				if (f) {
					const key = f.path ? `${f.path}/${f.filename}` : f.filename;
					next.add(key);
				}
			}
			selectedFiles = next;
			if (sortedFiles[toIndex]) {
				inspectedFile = sortedFiles[toIndex];
			}
		},

		selectAll() {
			const next = new Set<string>();
			for (const f of sortedFiles) {
				const key = f.path ? `${f.path}/${f.filename}` : f.filename;
				next.add(key);
			}
			selectedFiles = next;
		},

		clearSelection() {
			selectedFiles = new Set();
			lastSelectedIndex = -1;
			inspectedFile = null;
		},

		isSelected(file: MediaItem): boolean {
			const key = file.path ? `${file.path}/${file.filename}` : file.filename;
			return selectedFiles.has(key);
		},

		inspectFile(file: MediaItem | null) {
			inspectedFile = file;
		},

		navigateInspector(direction: 'prev' | 'next') {
			if (!inspectedFile) return;
			const idx = sortedFiles.findIndex(
				(f) => f.filename === inspectedFile!.filename && f.path === inspectedFile!.path,
			);
			const newIdx = direction === 'next' ? idx + 1 : idx - 1;
			if (newIdx >= 0 && newIdx < sortedFiles.length) {
				const file = sortedFiles[newIdx];
				this.select(file, newIdx);
			}
		},

		// File operations
		async deleteSelected(): Promise<string[]> {
			const errors: string[] = [];
			const keys = [...selectedFiles];
			for (const key of keys) {
				try {
					await deleteSiteMedia(key);
				} catch {
					errors.push(key);
				}
			}
			selectedFiles = new Set();
			inspectedFile = null;
			this.refresh();
			return errors;
		},

		async deleteFile(file: MediaItem): Promise<void> {
			const key = file.path ? `${file.path}/${file.filename}` : file.filename;
			await deleteSiteMedia(key);
			if (inspectedFile?.filename === file.filename && inspectedFile?.path === file.path) {
				inspectedFile = null;
			}
			const next = new Set(selectedFiles);
			next.delete(key);
			selectedFiles = next;
			this.refresh();
		},

		async createFolder(name: string): Promise<void> {
			const path = currentPath ? `${currentPath}/${name}` : name;
			await apiCreateFolder(path);
			this.refresh();
		},

		async deleteFolder(folder: FolderInfo): Promise<void> {
			await apiDeleteFolder(folder.path);
			this.refresh();
		},

		async renameFile(file: MediaItem, newName: string): Promise<MediaItem> {
			const fromKey = file.path ? `${file.path}/${file.filename}` : file.filename;
			const toKey = file.path ? `${file.path}/${newName}` : newName;
			const result = await apiRenameSiteMedia(fromKey, toKey);
			this.refresh();
			inspectedFile = result;
			return result;
		},

		async renameFolder(folder: FolderInfo, newName: string): Promise<void> {
			const parentPath = folder.path.includes('/')
				? folder.path.substring(0, folder.path.lastIndexOf('/'))
				: '';
			const newPath = parentPath ? `${parentPath}/${newName}` : newName;
			await apiRenameFolder(folder.path, newPath);
			this.refresh();
		},
	};
}

export const mediaManager = createMediaManagerStore();
