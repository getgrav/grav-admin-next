export interface SecuritySentinel {
	url: string;
	token: string;
	available: boolean;
	location?: string;
	extension?: string;
}

export interface ExposureCheck {
	exposed: boolean | null;
	exposedFiles: string[];
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
			.map((p) => (p.location && p.extension ? `${p.location}/*.${p.extension}` : 'user/data'))
	};
}
