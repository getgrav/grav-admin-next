import { api } from './client';
import { auth } from '$lib/stores/auth.svelte';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

function parseJwtSubject(token: string): string {
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		return payload.sub ?? '';
	} catch {
		return '';
	}
}

export async function login(username: string, password: string): Promise<void> {
	const data = await api.post<TokenResponse>('/auth/token', { username, password });
	auth.setTokens(data.access_token, data.refresh_token, data.expires_in);
	// Extract username from JWT subject claim; use login username as fallback
	const sub = parseJwtSubject(data.access_token) || username;
	auth.setUser(sub, sub);
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
