import { IntlMessageFormat } from 'intl-messageformat';
import { getTranslations } from '$lib/api/endpoints/translations';
import { getLocalStrings } from '$lib/i18n';
import { scopedKey } from '$lib/utils/scopedStorage';

const CACHE_KEY = scopedKey('grav_admin_i18n');
const CACHE_CHECKSUM_KEY = scopedKey('grav_admin_i18n_checksum');

const ICU_PREFIX = 'ICU.';

interface CachedTranslations {
	lang: string;
	checksum: string;
	strings: Record<string, string>;
}

export type TranslateParams = Record<string, string | number | boolean | Date | null | undefined>;

function loadCached(): CachedTranslations | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function createI18nStore() {
	const cached = loadCached();

	let lang = $state(cached?.lang ?? 'en');
	let strings = $state<Record<string, string>>({ ...getLocalStrings(cached?.lang ?? 'en'), ...(cached?.strings ?? {}) });
	let checksum = $state(cached?.checksum ?? '');
	let loading = $state(false);
	let loaded = $state(!!cached);

	// Compiled IntlMessageFormat instances, keyed by `${lang}::${icuKey}`.
	// Cleared whenever language or strings change so stale formatters don't leak.
	const formatterCache = new Map<string, IntlMessageFormat>();

	// Subscribers notified on locale change (used by the window.__GRAV_I18N global
	// so plugin web-component bundles can react without runes).
	const localeSubscribers = new Set<(locale: string) => void>();

	function notifyLocaleChanged() {
		for (const fn of localeSubscribers) {
			try { fn(lang); } catch { /* ignore subscriber errors */ }
		}
	}

	function resetFormatterCache() {
		formatterCache.clear();
	}

	function getFormatter(icuKey: string, message: string): IntlMessageFormat | null {
		const cacheKey = `${lang}::${icuKey}`;
		let f = formatterCache.get(cacheKey);
		if (f) return f;
		try {
			f = new IntlMessageFormat(message, lang);
			formatterCache.set(cacheKey, f);
			return f;
		} catch (err) {
			console.warn(`[i18n] Failed to compile ICU message for "${icuKey}":`, err);
			return null;
		}
	}

	/**
	 * Apply local boot fallback strings underneath the current map.
	 * API translations always take precedence — local strings only fill
	 * gaps for keys missing from the server response.
	 */
	function applyLocalFallback() {
		const local = getLocalStrings(lang);
		strings = { ...local, ...strings };
		resetFormatterCache();
	}

	function persist() {
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify({ lang, checksum, strings }));
		} catch {
			// localStorage full — translations still work from memory
		}
	}

	/**
	 * Translate a key.
	 *
	 * Lookup order:
	 *   1. `ICU.<key>` — formatted via ICU MessageFormat (placeholders, plurals, select)
	 *   2. `<key>` — returned raw (legacy / Grav 1-compatible strings)
	 *   3. Uppercase variant of `<key>`
	 *   4. Humanized fallback derived from the key itself
	 *
	 * Plugins targeting both Grav 1 and Grav 2 should ship two parallel blocks
	 * in their language YAML: top-level keys for Grav 1 / classic admin, and an
	 * `ICU:` block with the same keys (and any new ones) for admin-next.
	 *
	 * Usage:
	 *   t('PLUGIN_ADMIN.TITLE')
	 *   t('ADMIN_NEXT.PAGES.MOVED', { title: page.title })
	 *   t('ADMIN_NEXT.NOTIFICATIONS.UNREAD', { n: count })
	 */
	function t(key: string | undefined, params?: TranslateParams): string {
		if (!key) return '';

		// 1. Modern ICU lookup (preferred)
		const icuKey = ICU_PREFIX + key;
		const icuVal = strings[icuKey];
		if (icuVal !== undefined) {
			const f = getFormatter(icuKey, icuVal);
			if (f) {
				try {
					const out = f.format(params as Record<string, unknown> | undefined);
					return typeof out === 'string' ? out : String(out ?? '');
				} catch (err) {
					console.warn(`[i18n] Format error for "${icuKey}":`, err);
					return icuVal;
				}
			}
			return icuVal;
		}

		// 2. Legacy flat lookup (case-sensitive, returned raw)
		const val = strings[key];
		if (val !== undefined) return val;

		// 3. Try uppercase variant
		const upper = key.toUpperCase();
		const valUpper = strings[upper];
		if (valUpper !== undefined) return valUpper;

		// 4. Humanize fallback
		return humanizeKey(key);
	}

	/**
	 * True if either an ICU.<key> or a plain <key> entry exists.
	 */
	function has(key: string | undefined): boolean {
		if (!key) return false;
		return (ICU_PREFIX + key) in strings || key in strings || key.toUpperCase() in strings;
	}

	/**
	 * Check if a string looks like a translation key (e.g., PLUGIN_ADMIN.TITLE)
	 */
	function isTranslationKey(str: string): boolean {
		return /^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_.]*$/.test(str);
	}

	/**
	 * Translate if the value looks like a translation key, otherwise return as-is.
	 * Useful for blueprint labels which might be plain text or translation keys.
	 */
	function tMaybe(value: string | undefined, params?: TranslateParams): string {
		if (!value) return '';
		if (isTranslationKey(value)) return t(value, params);
		return value;
	}

	/**
	 * Convert a translation key to a human-readable fallback.
	 * PLUGIN_ADMIN.CONTENT → "Content"
	 * PLUGIN_ADMIN.SOME_FIELD_NAME → "Some Field Name"
	 */
	function humanizeKey(key: string): string {
		const parts = key.split('.');
		const last = parts[parts.length - 1];

		return last
			.replace(/^PLUGIN_\w+_/, '')
			.replace(/_/g, ' ')
			.toLowerCase()
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/**
	 * Load translations from the API. Uses checksum to skip if already current.
	 */
	async function load(language?: string) {
		const targetLang = language ?? lang;
		loading = true;

		try {
			const data = await getTranslations(targetLang);

			if (data.checksum !== checksum || data.lang !== lang) {
				const langChanged = data.lang !== lang;
				lang = data.lang;
				strings = data.strings;
				checksum = data.checksum;
				resetFormatterCache();
				applyLocalFallback();
				persist();
				if (langChanged) notifyLocaleChanged();
			}

			loaded = true;
		} catch {
			if (!loaded && cached) {
				loaded = true;
			}
		} finally {
			loading = false;
		}
	}

	/**
	 * Load a subset of translations (by prefix) for fast initial page load.
	 * Merges with any existing strings without replacing them.
	 */
	async function loadPrefix(prefix: string, language?: string) {
		const targetLang = language ?? lang;
		try {
			const data = await getTranslations(targetLang, prefix);
			const langChanged = data.lang !== lang;
			lang = data.lang;
			strings = { ...strings, ...data.strings };
			resetFormatterCache();
			applyLocalFallback();
			persist();
			if (langChanged) notifyLocaleChanged();
		} catch {
			// Non-critical — full load will happen later
		}
	}

	/**
	 * Load all translations in the background (non-blocking).
	 */
	function loadAllInBackground(language?: string) {
		load(language);
	}

	/**
	 * Switch to a different language.
	 */
	async function setLanguage(language: string) {
		if (language === lang && loaded) return;
		await load(language);
	}

	/**
	 * Subscribe to locale changes. Returns an unsubscribe function.
	 * Used by the window.__GRAV_I18N bridge for plugin web components.
	 */
	function subscribeLocale(fn: (locale: string) => void): () => void {
		localeSubscribers.add(fn);
		return () => localeSubscribers.delete(fn);
	}

	return {
		get lang() { return lang; },
		get loading() { return loading; },
		get loaded() { return loaded; },
		get count() { return Object.keys(strings).length; },
		t,
		tMaybe,
		has,
		isTranslationKey,
		load,
		loadPrefix,
		loadAllInBackground,
		setLanguage,
		subscribeLocale,
	};
}

export const i18n = createI18nStore();

/**
 * Global i18n bridge for plugin web-component bundles (editor-pro, ai-pro, etc.)
 * that aren't built against admin-next's Svelte runtime. Read-only API.
 *
 * Usage from a plugin field bundle:
 *   const { t, locale, subscribe } = window.__GRAV_I18N;
 *   const label = t('PLUGIN_EDITOR_PRO.TOOLBAR_BOLD');
 *   const unsub = subscribe((newLocale) => { ... });
 */
export interface GravI18nGlobal {
	t(key: string, params?: TranslateParams): string;
	has(key: string): boolean;
	readonly locale: string;
	subscribe(fn: (locale: string) => void): () => void;
}

declare global {
	interface Window {
		__GRAV_I18N?: GravI18nGlobal;
	}
}

if (typeof window !== 'undefined') {
	const bridge: GravI18nGlobal = {
		t: (key, params) => i18n.t(key, params),
		has: (key) => i18n.has(key),
		get locale() { return i18n.lang; },
		subscribe: (fn) => i18n.subscribeLocale(fn),
	};
	Object.defineProperty(window, '__GRAV_I18N', {
		value: bridge,
		writable: false,
		configurable: false,
	});
}
