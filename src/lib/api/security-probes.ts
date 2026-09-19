export interface SecuritySentinel {
	url: string;
	token: string;
	available: boolean;
	location?: string;
	extension?: string;
}

export interface ProbeResult {
	location: string;
	extension: string;
	/** true = served, false = blocked (403/404), null = inconclusive. */
	exposed: boolean | null;
}

export interface ExposureCheck {
	exposed: boolean | null;
	exposedFiles: string[];
	results?: ProbeResult[];
}

/**
 * What the pattern of served and blocked probes points to, so the banner can name the likely fix:
 * - `tmp`: only tmp/ was served, the other folders were blocked (server rules older than 2.1.7).
 * - `by-type`: a folder blocked some file types and served others (a static-file layer in front).
 * - `all`: every probe was served (the rules are not applied at all).
 * - `unknown`: anything else, including older APIs without per-probe locations.
 */
export type ExposurePattern = 'tmp' | 'by-type' | 'all' | 'unknown';

export function classifyExposure(results: ProbeResult[] = []): ExposurePattern {
	const known = results.filter((r) => r.location && r.exposed !== null);
	const served = known.filter((r) => r.exposed);
	if (!served.length) return 'unknown';

	const mixed = [...new Set(served.map((r) => r.location))].some((location) =>
		known.some((r) => r.location === location && r.exposed === false)
	);
	if (mixed) return 'by-type';

	const locations = new Set(known.map((r) => r.location));
	if (served.length === known.length && locations.size > 1) return 'all';

	const isTmp = (location: string) => location === 'tmp' || location.endsWith('/tmp');
	if (served.every((r) => isTmp(r.location)) && known.some((r) => !isTmp(r.location))) return 'tmp';

	return 'unknown';
}

/** A stable key for a set of exposed files, so a snooze or collapse ends when the set changes. */
export function exposureSignature(exposedFiles: string[]): string {
	return [...exposedFiles].sort().join('|');
}

export const SNOOZE_MS = 24 * 60 * 60 * 1000;

export interface BannerState {
	signature: string;
	collapsed?: boolean;
	snoozedUntil?: number;
}

/** Whether the saved state still applies: it only does for the same set of exposed files. */
export function bannerStateFor(saved: BannerState | null, signature: string, now = Date.now()) {
	if (!saved || saved.signature !== signature) return { collapsed: false, snoozed: false };
	return { collapsed: !!saved.collapsed, snoozed: (saved.snoozedUntil ?? 0) > now };
}

/**
 * A unique query string on every request, so a CDN answers from the origin rather than a
 * copy it cached before the server's rules changed. `cache: 'no-store'` only skips the
 * browser's own cache.
 */
function cacheBusted(url: string): string {
	return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Only a matching sentinel confirms exposure; only 403/404 confirms a blocked probe. */
export async function checkSecuritySentinels(
	probes: SecuritySentinel[],
	fetcher: typeof fetch = fetch
): Promise<ExposureCheck> {
	const results = await Promise.all(
		probes.map(async (probe) => {
			if (!probe.available || !probe.url || !probe.token) return null;
			try {
				const response = await fetcher(cacheBusted(probe.url), {
					credentials: 'omit',
					cache: 'no-store',
					signal: AbortSignal.timeout(5000)
				});
				if (response.status === 403 || response.status === 404) return false;
				if (!response.ok) return null;
				return (await response.text()).includes(probe.token) ? true : null;
			} catch {
				return null;
			}
		})
	);
	return {
		exposed: results.includes(true)
			? true
			: results.length > 0 && results.every((r) => r === false)
				? false
				: null,
		exposedFiles: probes
			.filter((_, i) => results[i] === true)
			.map((p) => (p.location && p.extension ? `${p.location}/*.${p.extension}` : 'user/data')),
		results: probes.map((p, i) => ({
			location: p.location ?? '',
			extension: p.extension ?? '',
			exposed: results[i]
		}))
	};
}
