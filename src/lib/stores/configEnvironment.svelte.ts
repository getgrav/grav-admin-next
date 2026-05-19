import { scopedKey } from '$lib/utils/scopedStorage';
import {
	getEnvironments,
	createEnvironment as apiCreateEnv,
	deleteEnvironment as apiDeleteEnv,
	type EnvironmentEntry,
	type EnvironmentList,
} from '$lib/api/endpoints/environments';

const STORAGE_KEY = scopedKey('grav_admin_config_env');

/**
 * The write-target environment for config/plugin/theme saves.
 *
 *   ''        → base user/config (default)
 *   'foo.com' → user/env/foo.com/config (must exist)
 *
 * Persisted per-user via scopedStorage. The client sends the selection as
 * the X-Config-Environment header; the API refuses writes to a non-existent
 * env folder with a 400.
 */
function createStore() {
	let target = $state<string>(loadStored());
	let detected = $state<string>('');
	let environments = $state<EnvironmentEntry[]>([]);
	let loading = $state(false);

	function loadStored(): string {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? (JSON.parse(raw).target ?? '') : '';
		} catch {
			return '';
		}
	}

	function persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ target }));
	}

	async function load(): Promise<EnvironmentList | null> {
		if (loading) return null;
		loading = true;
		try {
			const data = await getEnvironments();
			detected = data.detected;
			environments = data.environments;

			// If the stored selection no longer exists, silently fall back to base
			// so the user isn't writing to a target they removed.
			if (target !== '' && !environments.some((e) => e.name === target)) {
				target = '';
				persist();
			}
			return data;
		} finally {
			loading = false;
		}
	}

	function setTarget(name: string) {
		target = name;
		persist();
	}

	async function createAndSelect(name: string): Promise<EnvironmentEntry> {
		const entry = await apiCreateEnv(name);
		// Append optimistically and select immediately so the toast fires
		// without waiting on a refetch. The POST response sets
		// X-Invalidates: system:environments, which the switcher's
		// invalidation subscriber then turns into a background reload.
		if (!environments.some((e) => e.name === entry.name)) {
			environments = [...environments, entry];
		}
		setTarget(entry.name);
		return entry;
	}

	async function deleteEnvironment(name: string): Promise<void> {
		await apiDeleteEnv(name);
		// Drop locally so the row disappears immediately; the X-Invalidates
		// header on the DELETE response will reconcile in the background.
		environments = environments.filter((e) => e.name !== name);
		// If the deleted env was the active write target, fall back to base.
		if (target === name) {
			target = '';
			persist();
		}
	}

	return {
		get target() { return target; },
		get detected() { return detected; },
		get environments() { return environments; },
		get loading() { return loading; },
		get label() {
			if (target === '') return 'Default';
			return target;
		},
		load,
		setTarget,
		createAndSelect,
		deleteEnvironment,
	};
}

export const configEnv = createStore();
