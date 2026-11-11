/**
 * One request for everything the shell needs at startup.
 *
 * `GET /admin-next/boot` answers with what the separate boot calls return —
 * preferences, /me, menubar, sidebar, floating widgets, context panels,
 * custom fields, site languages, config environments, dashboard stats — plus the checksum of the admin dictionary.
 * Each store asks for its part with `takeBootPart()` on its first load and
 * keeps its own parsing; a part it gets nothing for (older API without the
 * endpoint, a part the user may not read, a failed request) falls back to
 * that store's own endpoint, exactly as before.
 *
 * A part is handed out once per sign-in, and only while the answer is fresh,
 * so every later refresh (polls, invalidations) goes to the individual
 * endpoints.
 */

import { untrack } from 'svelte';
import { api } from '$lib/api/client';
import { auth } from '$lib/stores/auth.svelte';
import { i18n } from '$lib/stores/i18n.svelte';

export type BootKey =
	| 'preferences'
	| 'me'
	| 'menubar'
	| 'sidebar'
	| 'floating_widgets'
	| 'context_panels'
	| 'custom_fields'
	| 'languages'
	| 'environments'
	| 'stats'
	| 'translations';

export interface BootTranslations {
	lang: string;
	checksum: string;
}

interface BootBody {
	data?: Partial<Record<BootKey, unknown>>;
	errors?: Record<string, { status?: number; title?: string }>;
}

/** Parts older than this are not handed out; the store fetches its own. */
const FRESH_MS = 30_000;

let pending: Promise<BootBody | null> | null = null;
let arrivedAt = 0;
let bootUser: string | null = null;
const taken = new Set<BootKey>();

function start(): Promise<BootBody | null> {
	const params: Record<string, string> = {};
	// The language whose dictionary we hold, so the checksum that comes back
	// can be compared with the cached one.
	const lang = untrack(() => i18n.lang);
	if (lang) params.lang = lang;
	return api
		.getFullBody<BootBody>('/admin-next/boot', params)
		.then((body) => {
			arrivedAt = Date.now();
			return body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body : null;
		})
		// Missing endpoint (404/405 on an older API) or any other failure:
		// every store falls back to its own request.
		.catch(() => null);
}

/** The boot request for the signed-in user, started if it isn't yet. */
function bootFor(user: string): Promise<BootBody | null> {
	if (bootUser !== user) {
		resetBoot();
		bootUser = user;
	}
	return (pending ??= start());
}

/**
 * Send the boot request now, as soon as the session is known, instead of
 * when the first store asks for its part. The stores ask from their effects,
 * which run after the current screen's own effects have sent its requests,
 * so the shell's data would otherwise queue up behind the page's.
 */
export function startBoot(): void {
	const user = untrack(() => (auth.isAuthenticated ? auth.username : null));
	if (user) void bootFor(user);
}

/**
 * This part of the boot answer, or null when the caller should fetch it
 * itself. Starts the boot request on first use in a signed-in session.
 */
export async function takeBootPart<T>(key: BootKey): Promise<{ value: T } | null> {
	const user = untrack(() => (auth.isAuthenticated ? auth.username : null));
	if (!user) return null;
	const request = bootFor(user);
	if (taken.has(key)) return null;
	taken.add(key);

	const body = await request;
	if (!body || Date.now() - arrivedAt > FRESH_MS) return null;
	if (body.errors && key in body.errors) return null;
	if (!(key in (body.data ?? {}))) return null;
	const value = body.data![key];
	return value === undefined ? null : { value: value as T };
}

/** Forget the boot answer, e.g. on sign-out, so the next sign-in boots again. */
export function resetBoot(): void {
	pending = null;
	arrivedAt = 0;
	bootUser = null;
	taken.clear();
}
