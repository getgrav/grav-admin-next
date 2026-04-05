import { getSiteLanguages, type LanguageInfo } from '$lib/api/endpoints/languages';

const STORAGE_KEY = 'grav_admin_content_lang';

function loadStored(): { activeLang?: string } {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

function createContentLangStore() {
	const stored = loadStored();

	let enabled = $state(false);
	let languages = $state<LanguageInfo[]>([]);
	let defaultLang = $state('');
	let activeLang = $state(stored.activeLang ?? '');
	let loading = $state(false);
	let loaded = $state(false);

	function persist() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeLang }));
	}

	async function load() {
		if (loading) return;
		loading = true;
		try {
			const data = await getSiteLanguages();
			enabled = data.enabled;
			languages = data.languages;
			defaultLang = data.default ?? '';

			// If stored activeLang is invalid or empty, use the default
			const validCodes = data.languages.map((l) => l.code);
			if (!activeLang || !validCodes.includes(activeLang)) {
				activeLang = defaultLang;
			}

			persist();
			loaded = true;
		} catch {
			// Non-critical — site may not have multilang
			enabled = false;
			loaded = true;
		} finally {
			loading = false;
		}
	}

	function setLanguage(lang: string) {
		activeLang = lang;
		persist();
	}

	function getLanguageName(code: string): string {
		const lang = languages.find((l) => l.code === code);
		return lang?.native_name ?? lang?.name ?? code;
	}

	function getLanguageInfo(code: string): LanguageInfo | undefined {
		return languages.find((l) => l.code === code);
	}

	return {
		get enabled() { return enabled; },
		get languages() { return languages; },
		get defaultLang() { return defaultLang; },
		get activeLang() { return activeLang; },
		get loading() { return loading; },
		get loaded() { return loaded; },
		get isDefault() { return activeLang === defaultLang; },

		load,
		setLanguage,
		getLanguageName,
		getLanguageInfo,
	};
}

export const contentLang = createContentLangStore();
