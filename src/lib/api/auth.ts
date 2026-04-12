import { api } from './client';
import { auth } from '$lib/stores/auth.svelte';
import { base } from '$app/paths';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
	user?: UserProfile;
}

interface ChallengeResponse {
	requires_2fa: true;
	challenge_token: string;
	expires_in: number;
	token_type: 'Challenge';
}

export interface LoginResult {
	requires2fa: boolean;
	challengeToken?: string;
}

interface UserProfile {
	username: string;
	email: string | null;
	fullname: string | null;
	avatar_url: string | null;
	super_admin?: boolean;
	access?: Record<string, boolean>;
	content_editor?: string;
}

function parseJwtSubject(token: string): string {
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		return payload.sub ?? '';
	} catch {
		return '';
	}
}

async function finalizeLogin(data: TokenResponse, fallbackSubject: string): Promise<void> {
	auth.setTokens(data.access_token, data.refresh_token, data.expires_in);

	const sub = parseJwtSubject(data.access_token) || fallbackSubject;

	// If the token response includes the user block (new API), use it directly
	if (data.user) {
		auth.setUser(
			data.user.username || sub,
			data.user.fullname || sub,
			data.user.email || '',
			data.user.avatar_url || '',
			data.user.content_editor || '',
		);
		auth.setPermissions(data.user.super_admin ?? false, data.user.access ?? {});
		return;
	}

	// Fallback: fetch user profile separately (older API without user block)
	try {
		const profile = await api.get<UserProfile>(`/users/${sub}`);
		auth.setUser(
			sub,
			profile.fullname || sub,
			profile.email || '',
			profile.avatar_url || '',
		);
		auth.setPermissions(profile.super_admin ?? false, profile.access ?? {});
	} catch {
		auth.setUser(sub, sub);
		auth.setPermissions(false, {});
	}
}

export async function login(username: string, password: string): Promise<LoginResult> {
	const data = await api.post<TokenResponse | ChallengeResponse>('/auth/token', {
		username,
		password,
	});

	if ('requires_2fa' in data && data.requires_2fa) {
		return { requires2fa: true, challengeToken: data.challenge_token };
	}

	await finalizeLogin(data as TokenResponse, username);
	return { requires2fa: false };
}

export async function verify2fa(challengeToken: string, code: string): Promise<void> {
	const data = await api.post<TokenResponse>('/auth/2fa/verify', {
		challenge_token: challengeToken,
		code,
	});
	await finalizeLogin(data, '');
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
	// Send the admin-next origin + base path so the backend can build a
	// reset link that points back into this admin UI (not the Grav frontend
	// login plugin's /reset_password page, and not wherever the API happens
	// to be served from — which can differ when vite proxies in dev).
	const adminBaseUrl =
		typeof window !== 'undefined' ? window.location.origin + base : undefined;
	const body: Record<string, string> = { email };
	if (adminBaseUrl) body.admin_base_url = adminBaseUrl;
	return api.post<{ message: string }>('/auth/forgot-password', body);
}

export async function resetPassword(
	username: string,
	token: string,
	password: string,
): Promise<{ message: string }> {
	return api.post<{ message: string }>('/auth/reset-password', {
		username,
		token,
		password,
	});
}

/**
 * Refresh the current user's profile and resolved permissions from GET /me.
 * Called on app startup and after re-authentication to keep permissions fresh.
 */
export async function refreshMe(): Promise<void> {
	try {
		const profile = await api.get<UserProfile>('/me');
		auth.setUser(
			profile.username || auth.username,
			profile.fullname || auth.username,
			profile.email || '',
			profile.avatar_url || undefined,
			profile.content_editor || '',
		);
		auth.setPermissions(profile.super_admin ?? false, profile.access ?? {});
	} catch {
		// Non-critical — keep existing permissions
	}
}

export async function logout(): Promise<void> {
	try {
		if (auth.refreshToken) {
			await api.post('/auth/revoke', { refresh_token: auth.refreshToken });
		}
	} catch {
		// Revocation failure is non-critical
	} finally {
		auth.logout();
	}
}
