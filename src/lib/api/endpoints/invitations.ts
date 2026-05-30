import { api } from '../client';
import { base } from '$app/paths';

export interface Invitation {
	token: string;
	email: string;
	fullname: string;
	groups: string[];
	created: number;
	created_by: string;
	created_by_name: string;
	expires: number;
	expired: boolean;
	/** Present on create/resend responses. */
	link?: string;
	email_sent?: boolean;
	warning?: string;
}

interface InvitationsBody {
	invitations: Invitation[];
}

function adminBaseUrl(): string | undefined {
	return typeof window !== 'undefined' ? window.location.origin + base : undefined;
}

/**
 * List pending invitations.
 */
export async function getInvitations(): Promise<Invitation[]> {
	const data = await api.get<InvitationsBody>('/invitations');
	return data?.invitations ?? [];
}

export interface CreateInvitationInput {
	email: string;
	fullname?: string;
	access?: Record<string, unknown>;
	groups?: string[];
	/** Lifetime in seconds; omit for server default (7 days). */
	expiration?: number;
	/** Optional personal note included in the email. */
	message?: string;
}

/**
 * Create an invitation. The backend sends the email when configured; the
 * returned record always carries a copyable `link` and an `email_sent` flag.
 */
export async function createInvitation(input: CreateInvitationInput): Promise<Invitation> {
	const body: Record<string, unknown> = { ...input };
	const abu = adminBaseUrl();
	if (abu) body.admin_base_url = abu;
	return api.post<Invitation>('/invitations', body);
}

/**
 * Resend the email for an existing invitation.
 */
export async function resendInvitation(token: string): Promise<Invitation> {
	const body: Record<string, unknown> = {};
	const abu = adminBaseUrl();
	if (abu) body.admin_base_url = abu;
	return api.post<Invitation>(`/invitations/${encodeURIComponent(token)}/resend`, body);
}

/**
 * Revoke an invitation.
 */
export async function deleteInvitation(token: string): Promise<void> {
	await api.delete(`/invitations/${encodeURIComponent(token)}`);
}
