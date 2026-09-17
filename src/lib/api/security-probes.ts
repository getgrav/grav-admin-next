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

/** Only a matching sentinel confirms exposure; only 403/404 confirms a blocked probe. */
export async function checkSecuritySentinels(
	probes: SecuritySentinel[],
	fetcher: typeof fetch = fetch
): Promise<ExposureCheck> {
	const results = await Promise.all(
		probes.map(async (probe) => {
			if (!probe.available || !probe.url || !probe.token) return null;
			try {
				const response = await fetcher(probe.url, {
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
