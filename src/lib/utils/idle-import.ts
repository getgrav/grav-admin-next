/**
 * Keep a module out of the first load, but have it in memory soon after.
 *
 * Returns a loader for `{#await}` that imports the module once and shares
 * the promise. The import also starts by itself when the browser is next
 * idle after boot, so the module is loaded long before it's needed. Waiting
 * until it's needed would fail if admin2 was updated while the tab was open
 * (the old chunk names are gone), and the components this is for (sign-in
 * again, plugin dialogs, the debug panel) are exactly the ones that must not
 * fail to appear.
 */
export function idleImport<T>(load: () => Promise<T>): () => Promise<T> {
	let promise: Promise<T> | undefined;
	const get = () => (promise ??= load());

	if (typeof window !== 'undefined') {
		const start = () => void get().catch(() => (promise = undefined));
		if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5000 });
		else setTimeout(start, 2000);
	}

	return get;
}
