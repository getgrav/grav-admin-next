import { api } from '$lib/api/client';

export interface SecurityProbe {
	/** Public URL of the sentinel file under user/data. */
	url: string;
	/** Token the sentinel file contains; matched against the fetched body. */
	token: string;
	/** False when the sentinel could not be written (probe can't run). */
	available: boolean;
}

export async function getSecurityProbe(): Promise<SecurityProbe> {
	return api.get<SecurityProbe>('/dashboard/security/exposure-probe');
}

/**
 * Detect whether the sensitive user/ folders are reachable over the web by
 * fetching the sentinel file directly from the browser — the same request an
 * attacker would make, so this is ground truth for the actual webserver
 * config, not a server-side heuristic.
 *
 * Returns `true` if exposed (200 + matching token), `false` if blocked
 * (403/404), or `null` if the check could not be completed (network error,
 * sentinel unavailable) — in which case the dashboard stays silent rather
 * than showing a false alarm.
 */
export async function checkUserFolderExposure(): Promise<boolean | null> {
	let probe: SecurityProbe;
	try {
		probe = await getSecurityProbe();
	} catch {
		// Endpoint unreachable or permission denied — say nothing.
		return null;
	}

	if (!probe?.available || !probe.url || !probe.token) {
		return null;
	}

	try {
		const resp = await fetch(probe.url, { credentials: 'omit', cache: 'no-store' });
		if (!resp.ok) {
			// 403 / 404 — the folder is correctly blocked.
			return false;
		}
		const body = await resp.text();
		return body.includes(probe.token);
	} catch {
		// A network/CORS error means the browser could not read it — treat as
		// undetermined rather than exposed.
		return null;
	}
}
