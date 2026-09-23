import { api } from '$lib/api/client';
import {
	checkSecuritySentinels,
	type ExposureCheck,
	type SecuritySentinel
} from '$lib/api/security-probes';
import { scopedKey } from '$lib/utils/scopedStorage';

export interface SecurityProbe extends SecuritySentinel {
	probes?: SecuritySentinel[];
}

export async function getSecurityProbe(): Promise<SecurityProbe> {
	return api.get<SecurityProbe>('/dashboard/security/exposure-probe');
}

/**
 * The exposure check fetches sentinel files from the site's public host, and
 * every correctly blocked one shows up as a red 403 in the browser console.
 * Its answer is kept for the browser session, keyed on the probes themselves,
 * so it runs once per session rather than on every dashboard visit. A change
 * in the server's probe URLs or tokens re-checks; so does `force` (the
 * dashboard's Refresh button).
 */
const SESSION_KEY = scopedKey('grav_admin_exposure_check');

interface StoredCheck {
	signature: string;
	result: ExposureCheck;
}

function probeSignature(probes: SecuritySentinel[]): string {
	return JSON.stringify(probes.map((p) => [p.url, p.token, p.available]));
}

function readStored(signature: string): ExposureCheck | null {
	try {
		const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as StoredCheck | null;
		return stored?.signature === signature ? stored.result : null;
	} catch {
		return null;
	}
}

function store(signature: string, result: ExposureCheck): void {
	try {
		sessionStorage.setItem(SESSION_KEY, JSON.stringify({ signature, result } satisfies StoredCheck));
	} catch {
		// Storage unavailable: the next visit simply checks again.
	}
}

export async function checkSensitiveFileExposure(force = false): Promise<ExposureCheck> {
	try {
		const response = await getSecurityProbe();
		// Older API versions supply only the original user/data sentinel.
		const probes = response.probes ?? [response];
		const signature = probeSignature(probes);
		if (!force) {
			const cached = readStored(signature);
			if (cached) return cached;
		}
		const result = await checkSecuritySentinels(probes);
		store(signature, result);
		return result;
	} catch {
		return { exposed: null, exposedFiles: [] };
	}
}
