import { api } from '$lib/api/client';
import type { PasswordPolicy } from '$lib/utils/passwordStrength';

let cached = $state<PasswordPolicy | null>(null);
let inflight: Promise<PasswordPolicy> | null = null;

async function fetchPolicy(): Promise<PasswordPolicy> {
	const data = await api.get<PasswordPolicy>('/auth/password-policy');
	cached = data;
	return data;
}

export const passwordPolicy = {
	get current(): PasswordPolicy | null {
		return cached;
	},

	/**
	 * Seed the policy directly from another endpoint's response (e.g. the
	 * setup status endpoint, which piggybacks the policy to save a round-trip).
	 */
	seed(policy: PasswordPolicy | null | undefined) {
		if (policy) cached = policy;
	},

	/**
	 * Load the policy, reusing the cached copy. In-flight requests are
	 * deduped so concurrent component mounts share a single fetch.
	 */
	async load(): Promise<PasswordPolicy> {
		if (cached) return cached;
		if (!inflight) {
			inflight = fetchPolicy().finally(() => {
				inflight = null;
			});
		}
		return inflight;
	},

	clear() {
		cached = null;
	},
};
