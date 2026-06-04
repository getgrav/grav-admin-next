import {
	getEnvironments,
	createEnvironment as apiCreateEnv,
	deleteEnvironment as apiDeleteEnv,
	type EnvironmentEntry,
	type EnvironmentList,
} from '$lib/api/endpoints/environments';
import { auth } from '$lib/stores/auth.svelte';

/**
 * The active session environment for config/plugin/theme/pages — it governs
 * both what you READ (Grav reinitializes under it, so reads come back base +
 * overlay) and where config WRITES land. There is one source of truth:
 * `auth.environment`.
 *
 *   ''        → base user/config ("Default"); the client sends the reserved
 *               `default` sentinel for both env headers (no env folder → Grav
 *               resolves base-only reads, and the server maps the sentinel to a
 *               base write).
 *   'foo.com' → user/env/foo.com/config (must exist on disk).
 *
 * Because the selected environment changes the whole admin (sidebar,
 * permissions, plugin/page listings, config), switching it re-bootstraps the
 * app with a full page reload. The selection itself persists via the auth
 * store, so it survives the reload.
 */
function createStore() {
	let detected = $state<string>('');
	let environments = $state<EnvironmentEntry[]>([]);
	let loading = $state(false);

	async function load(): Promise<EnvironmentList | null> {
		if (loading) return null;
		loading = true;
		try {
			const data = await getEnvironments();
			detected = data.detected;
			environments = data.environments;

			// Reconcile the active selection with what actually exists on disk.
			// A non-empty target with no matching env folder — a host-detected
			// default that has no overlay, or an env that was deleted — falls
			// back to base so the write header stays valid and the badge is
			// honest. Done silently (no reload); the first requests already went
			// out and, with no folder, resolve base-only anyway.
			const target = auth.environment;
			if (target !== '' && !environments.some((e) => e.name === target)) {
				auth.environment = '';
			}
			return data;
		} finally {
			loading = false;
		}
	}

	function reloadApp() {
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	}

	/**
	 * Switch the active session environment. Persists the choice and re-runs the
	 * admin under it via a full reload. No-ops when already on that target.
	 */
	function setTarget(name: string) {
		if (name === auth.environment) return;
		auth.environment = name; // persisted by the auth store
		reloadApp();
	}

	async function createAndSelect(name: string): Promise<EnvironmentEntry> {
		const entry = await apiCreateEnv(name);
		// Append optimistically so the list is consistent if the reload is
		// somehow deferred; setTarget then switches into the new env.
		if (!environments.some((e) => e.name === entry.name)) {
			environments = [...environments, entry];
		}
		setTarget(entry.name);
		return entry;
	}

	async function deleteEnvironment(name: string): Promise<void> {
		await apiDeleteEnv(name);
		environments = environments.filter((e) => e.name !== name);
		// If the deleted env was the active one, fall back to base (and reload).
		if (auth.environment === name) {
			setTarget('');
		}
	}

	return {
		get target() { return auth.environment; },
		get detected() { return detected; },
		get environments() { return environments; },
		get loading() { return loading; },
		get label() {
			return auth.environment === '' ? 'Default' : auth.environment;
		},
		load,
		setTarget,
		createAndSelect,
		deleteEnvironment,
	};
}

export const configEnv = createStore();
