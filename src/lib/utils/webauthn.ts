/**
 * Browser side of passkeys (WebAuthn), shared by the login page and the
 * Passkeys card on a user's page.
 *
 * The API sends options as JSON with every binary field in base64url and
 * takes the browser's answer back the same way, in the PublicKeyCredential
 * JSON form. These helpers turn one into the other.
 */

/** Options for navigator.credentials.get(), as the API sends them. */
export interface PasskeyRequestOptionsJSON {
	challenge: string;
	rpId?: string;
	timeout?: number;
	allowCredentials?: PasskeyDescriptorJSON[];
	userVerification?: UserVerificationRequirement;
}

/** Options for navigator.credentials.create(), as the API sends them. */
export interface PasskeyCreationOptionsJSON {
	challenge: string;
	rp: { id?: string; name: string };
	user: { id: string; name: string; displayName: string };
	pubKeyCredParams: PublicKeyCredentialParameters[];
	timeout?: number;
	excludeCredentials?: PasskeyDescriptorJSON[];
	authenticatorSelection?: AuthenticatorSelectionCriteria;
	attestation?: AttestationConveyancePreference;
}

export interface PasskeyDescriptorJSON {
	type: 'public-key';
	id: string;
	transports?: AuthenticatorTransport[];
}

/** What the API hands back to start a ceremony: options plus a one-use ticket. */
export interface PasskeyStart<O> {
	options: O;
	ticket: string;
}

/** The browser's answer, ready to send to the API. */
export interface PasskeyCredentialJSON {
	id: string;
	rawId: string;
	type: string;
	response: Record<string, unknown>;
}

/** Same localStorage flag the site's login page sets, so both agree. */
const USED_FLAG = 'grav-passkey';

export function toBytes(b64u: string): ArrayBuffer {
	let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
	while (b64.length % 4) b64 += '=';
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out.buffer;
}

export function toB64u(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function withIds(list: PasskeyDescriptorJSON[] | undefined): PublicKeyCredentialDescriptor[] {
	return (list ?? []).map((c) => ({ ...c, id: toBytes(c.id) }));
}

/** Whether this browser, on this page, can use passkeys at all. */
export function passkeysSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		!!window.PublicKeyCredential &&
		window.isSecureContext &&
		!!navigator.credentials?.get
	);
}

/** Whether the browser offers passkeys in the username field's autofill. */
export async function autofillSupported(): Promise<boolean> {
	if (!passkeysSupported()) return false;
	try {
		return (await PublicKeyCredential.isConditionalMediationAvailable?.()) === true;
	} catch {
		return false;
	}
}

/** True once this browser has finished a passkey ceremony on this site. */
export function passkeyUsedHere(): boolean {
	try {
		return localStorage.getItem(USED_FLAG) === '1';
	} catch {
		return false;
	}
}

export function rememberPasskeyUsed(): void {
	try {
		localStorage.setItem(USED_FLAG, '1');
	} catch {
		/* storage blocked; the button just doesn't lead next time */
	}
}

/**
 * The person closed the browser's dialog, it timed out, or we aborted it.
 * Browsers report all three as NotAllowedError or AbortError.
 */
export function passkeyCancelled(err: unknown): boolean {
	const name = (err as { name?: string } | null)?.name;
	return name === 'NotAllowedError' || name === 'AbortError';
}

/** The authenticator already holds a passkey for this account (create only). */
export function passkeyAlreadySaved(err: unknown): boolean {
	return (err as { name?: string } | null)?.name === 'InvalidStateError';
}

function credentialJSON(cred: PublicKeyCredential): PasskeyCredentialJSON {
	const r = cred.response;
	const response: Record<string, unknown> = { clientDataJSON: toB64u(r.clientDataJSON) };
	if ('attestationObject' in r) {
		const att = r as AuthenticatorAttestationResponse;
		response.attestationObject = toB64u(att.attestationObject);
		try {
			response.transports = att.getTransports?.() ?? [];
		} catch {
			/* older browsers */
		}
	} else {
		const asr = r as AuthenticatorAssertionResponse;
		response.authenticatorData = toB64u(asr.authenticatorData);
		response.signature = toB64u(asr.signature);
		if (asr.userHandle) response.userHandle = toB64u(asr.userHandle);
	}
	return { id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, response };
}

/**
 * Ask the browser for a passkey. `mediation: 'conditional'` offers it in the
 * username field's autofill instead of a dialog; pass a `signal` to stop it.
 */
export async function getPasskey(
	options: PasskeyRequestOptionsJSON,
	opts: { mediation?: CredentialMediationRequirement; signal?: AbortSignal } = {}
): Promise<PasskeyCredentialJSON> {
	const request: CredentialRequestOptions = {
		publicKey: {
			...options,
			challenge: toBytes(options.challenge),
			allowCredentials: withIds(options.allowCredentials)
		}
	};
	if (opts.mediation) request.mediation = opts.mediation;
	if (opts.signal) request.signal = opts.signal;
	const cred = (await navigator.credentials.get(request)) as PublicKeyCredential | null;
	if (!cred) throw new DOMException('No passkey was used.', 'NotAllowedError');
	return credentialJSON(cred);
}

/** Ask the browser to make a new passkey. */
export async function createPasskey(
	options: PasskeyCreationOptionsJSON
): Promise<PasskeyCredentialJSON> {
	const cred = (await navigator.credentials.create({
		publicKey: {
			...options,
			challenge: toBytes(options.challenge),
			user: { ...options.user, id: toBytes(options.user.id) },
			excludeCredentials: withIds(options.excludeCredentials)
		}
	})) as PublicKeyCredential | null;
	if (!cred) throw new DOMException('No passkey was made.', 'NotAllowedError');
	return credentialJSON(cred);
}
