import { getTranslations } from '$lib/api/endpoints/translations';
import { getLocalStrings } from '$lib/i18n';

const CACHE_KEY = 'grav_admin_i18n';
const CACHE_CHECKSUM_KEY = 'grav_admin_i18n_checksum';

interface CachedTranslations {
	lang: string;
	checksum: string;
	strings: Record<string, string>;
}

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

	/** Merge local admin-next translations (ADMIN_NEXT.*) into current strings */
	function mergeLocalStrings() {
		const local = getLocalStrings(lang);
		strings = { ...strings, ...local };
	}

	function persist() {
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify({ lang, checksum, strings }));
		} catch {
			// localStorage full — translations still work from memory
		}
	}

	/**
	 * Translate a key. Returns the translated string, or a cleaned-up
	 * version of the key if no translation is found.
	 *
	 * Usage: t('PLUGIN_ADMIN.TITLE') → "Title"
	 */
	function t(key: string | undefined): string {
		if (!key) return '';

		// Direct lookup (case-sensitive)
		const val = strings[key];
		if (val !== undefined) return val;

		// Try uppercase version
		const upper = key.toUpperCase();
		const valUpper = strings[upper];
		if (valUpper !== undefined) return valUpper;

		// No translation found — make the key human-readable as fallback
		return humanizeKey(key);
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
	function tMaybe(value: string | undefined): string {
		if (!value) return '';
		if (isTranslationKey(value)) return t(value);
		return value;
	}

	/**
	 * Convert a translation key to a human-readable fallback.
	 * PLUGIN_ADMIN.CONTENT → "Content"
	 * PLUGIN_ADMIN.SOME_FIELD_NAME → "Some Field Name"
	 */
	function humanizeKey(key: string): string {
		// Take the last segment after the last dot
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

			// Only update if translations changed
			if (data.checksum !== checksum || data.lang !== lang) {
				lang = data.lang;
				strings = data.strings;
				checksum = data.checksum;
				mergeLocalStrings();
				persist();
			}

			loaded = true;
		} catch {
			// Keep cached translations if fetch fails
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
			lang = data.lang;
			// Merge prefix strings into existing strings
			strings = { ...strings, ...data.strings };
			mergeLocalStrings();
			persist();
		} catch {
			// Non-critical — full load will happen later
		}
	}

	/**
	 * Load all translations in the background (non-blocking).
	 * Call this after loadPrefix to fill in the rest while user is busy.
	 */
	function loadAllInBackground(language?: string) {
		// Fire and forget — don't await
		load(language);
	}

	/**
	 * Switch to a different language.
	 */
	async function setLanguage(language: string) {
		if (language === lang && loaded) return;
		await load(language);
	}

	return {
		get lang() { return lang; },
		get loading() { return loading; },
		get loaded() { return loaded; },
		get count() { return Object.keys(strings).length; },
		t,
		tMaybe,
		isTranslationKey,
		load,
		loadPrefix,
		loadAllInBackground,
		setLanguage,
	};
}

export const i18n = createI18nStore();
