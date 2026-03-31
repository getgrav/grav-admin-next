import { api } from './client';
import { auth } from '$lib/stores/auth.svelte';

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

interface UserProfile {
	username: string;
	email: string | null;
	fullname: string | null;
	avatar_url: string | null;
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

	const sub = parseJwtSubject(data.access_token) || username;

	// Fetch the user's profile to get fullname, email, and avatar
	try {
		const profile = await api.get<UserProfile>(`/users/${sub}`);
		auth.setUser(
			sub,
			profile.fullname || sub,
			profile.email || '',
			profile.avatar_url || '',
		);
	} catch {
		auth.setUser(sub, sub);
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
