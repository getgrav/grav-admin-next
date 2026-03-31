import { auth } from '$lib/stores/auth.svelte';

/**
 * Get initials from a name or username.
 */
export function getInitials(fullname: string | null | undefined, username: string): string {
	if (fullname) {
		return fullname
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
	return username.slice(0, 2).toUpperCase();
}

/**
 * Generate a deterministic SVG avatar data URI from a seed string.
 * Creates a gradient background with geometric shapes and initials.
 */
export function generateAvatarSvg(seed: string, initials: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
	}

	const hue1 = Math.abs(hash % 360);
	const hue2 = (hue1 + 40 + Math.abs((hash >> 8) % 40)) % 360;
	const sat = 55 + Math.abs((hash >> 4) % 25);
	const light = 45 + Math.abs((hash >> 12) % 15);

	const c1 = `hsl(${hue1}, ${sat}%, ${light}%)`;
	const c2 = `hsl(${hue2}, ${sat}%, ${light + 10}%)`;

	const shapes: string[] = [];
	for (let i = 0; i < 5; i++) {
		const bits = Math.abs((hash >> (i * 5)) % 32);
		const x = 20 + (bits % 5) * 15;
		const y = 20 + Math.floor(bits / 5) * 15;
		const size = 8 + (bits % 12);
		const opacity = 0.08 + (bits % 4) * 0.04;
		shapes.push(`<circle cx="${x}" cy="${y}" r="${size}" fill="white" opacity="${opacity}"/>`);
	}

	return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${shapes.join('')}<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="38" font-weight="600" fill="white" opacity="0.9">${initials}</text></svg>`)}`;
}

/**
 * Resolve a user's avatar URL — custom upload or generated fallback.
 */
export function resolveAvatarUrl(
	avatarUrl: string | null | undefined,
	email: string | null | undefined,
	fullname: string | null | undefined,
	username: string,
): string {
	if (avatarUrl) {
		if (avatarUrl.startsWith('http')) return avatarUrl;
		return `${auth.serverUrl}${avatarUrl}`;
	}
	const initials = getInitials(fullname, username);
	return generateAvatarSvg(email ?? username, initials);
}
