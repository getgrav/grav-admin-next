import { api } from '$lib/api/client';
import {
	checkSecuritySentinels,
	type ExposureCheck,
	type SecuritySentinel
} from '$lib/api/security-probes';

export interface SecurityProbe extends SecuritySentinel {
	probes?: SecuritySentinel[];
}

export async function getSecurityProbe(): Promise<SecurityProbe> {
	return api.get<SecurityProbe>('/dashboard/security/exposure-probe');
}

export async function checkSensitiveFileExposure(): Promise<ExposureCheck> {
	try {
		const response = await getSecurityProbe();
		// Older API versions supply only the original user/data sentinel.
		return await checkSecuritySentinels(response.probes ?? [response]);
	} catch {
		return { exposed: null, exposedFiles: [] };
	}
}
