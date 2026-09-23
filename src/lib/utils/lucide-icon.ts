/**
 * Resolve a Lucide icon that a plugin names at runtime — a context panel's
 * `icon`, a dashboard notification's `icon` — without shipping the whole icon
 * set to every screen.
 *
 * Accepts the forms plugins already send: kebab ("shield-check"), Pascal
 * ("ShieldCheck"), lucide's `Lucide…` / `…Icon` export names, and lucide's
 * older names ("AlertCircle"). Icons are grouped into one lazy chunk per first
 * letter (see the `lucideIconBuckets` plugin in vite.config.ts), so the first
 * lookup for a letter costs one small request and later ones are free.
 */
import type { Component } from 'svelte';

type IconMap = Record<string, Component>;
type Loader = () => Promise<{ default: IconMap }>;

// Vite needs every dynamic import spelled out, so one entry per letter.
const BUCKETS: Record<string, Loader> = {
	a: () => import('virtual:lucide-icons/a'),
	b: () => import('virtual:lucide-icons/b'),
	c: () => import('virtual:lucide-icons/c'),
	d: () => import('virtual:lucide-icons/d'),
	e: () => import('virtual:lucide-icons/e'),
	f: () => import('virtual:lucide-icons/f'),
	g: () => import('virtual:lucide-icons/g'),
	h: () => import('virtual:lucide-icons/h'),
	i: () => import('virtual:lucide-icons/i'),
	j: () => import('virtual:lucide-icons/j'),
	k: () => import('virtual:lucide-icons/k'),
	l: () => import('virtual:lucide-icons/l'),
	m: () => import('virtual:lucide-icons/m'),
	n: () => import('virtual:lucide-icons/n'),
	o: () => import('virtual:lucide-icons/o'),
	p: () => import('virtual:lucide-icons/p'),
	q: () => import('virtual:lucide-icons/q'),
	r: () => import('virtual:lucide-icons/r'),
	s: () => import('virtual:lucide-icons/s'),
	t: () => import('virtual:lucide-icons/t'),
	u: () => import('virtual:lucide-icons/u'),
	v: () => import('virtual:lucide-icons/v'),
	w: () => import('virtual:lucide-icons/w'),
	x: () => import('virtual:lucide-icons/x'),
	y: () => import('virtual:lucide-icons/y'),
	z: () => import('virtual:lucide-icons/z'),
};

const bucketCache = new Map<string, Promise<IconMap>>();
let aliasCache: Promise<Record<string, string>> | null = null;
const resolved = new Map<string, Component | undefined>();

function bucket(letter: string): Promise<IconMap> {
	let p = bucketCache.get(letter);
	if (!p) {
		const load = BUCKETS[letter];
		p = load ? load().then((m) => m.default).catch(() => ({})) : Promise.resolve({});
		bucketCache.set(letter, p);
	}
	return p;
}

function aliases(): Promise<Record<string, string>> {
	aliasCache ??= import('virtual:lucide-icons/aliases').then((m) => m.default).catch(() => ({}));
	return aliasCache;
}

/** "shield-check" / "shieldCheck" / "ShieldCheck" → "ShieldCheck". */
export function lucidePascalName(name: string): string {
	const trimmed = name.trim();
	if (trimmed.includes('-') || trimmed.includes('_')) {
		return trimmed
			.split(/[-_]+/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join('');
	}
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function lookup(pascal: string): Promise<Component | undefined> {
	if (!pascal) return undefined;
	const icons = await bucket(pascal.charAt(0).toLowerCase());
	return icons[pascal];
}

/**
 * True when a value could name a Lucide icon at all. Emoji and other text
 * (the getgrav notification feed sends emoji) never trigger a chunk load.
 */
export function isLucideIconName(name: string | null | undefined): name is string {
	return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(name.trim());
}

/**
 * The Lucide component for a plugin-supplied icon name, or undefined when the
 * name is not a Lucide icon (an emoji, a typo) so the caller can fall back.
 */
export function loadLucideIcon(name: string | null | undefined): Promise<Component | undefined> {
	if (!isLucideIconName(name)) return Promise.resolve(undefined);
	if (resolved.has(name)) return Promise.resolve(resolved.get(name));

	const pascal = lucidePascalName(name);
	const candidates = [pascal];
	if (pascal.startsWith('Lucide') && pascal.length > 6) candidates.push(pascal.slice(6));
	if (pascal.endsWith('Icon') && pascal.length > 4) candidates.push(pascal.slice(0, -4));

	return (async () => {
		for (const candidate of candidates) {
			const direct = await lookup(candidate);
			if (direct) return direct;
		}
		const map = await aliases();
		for (const candidate of candidates) {
			const target = map[candidate];
			if (target) {
				const viaAlias = await lookup(target);
				if (viaAlias) return viaAlias;
			}
		}
		return undefined;
	})().then((icon) => {
		resolved.set(name, icon);
		return icon;
	});
}

/**
 * Synchronous read for first paint: the component when it has already been
 * resolved, undefined when the name is known not to be an icon, and null when
 * it still has to be loaded.
 */
export function peekLucideIcon(name: string | null | undefined): Component | undefined | null {
	if (!isLucideIconName(name)) return undefined;
	return resolved.has(name) ? resolved.get(name) : null;
}
