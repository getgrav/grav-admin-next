import { api } from '../client';

export interface TranslationsResponse {
	lang: string;
	dir: 'ltr' | 'rtl';
	count: number;
	checksum: string;
	strings: Record<string, string>;
}

/**
 * The admin's own UI dictionary. Public (no auth) and English-backfilled, so a
 * key the requested language hasn't translated still renders real words rather
 * than a humanized key.
 */
export async function getTranslations(lang: string, prefix?: string): Promise<TranslationsResponse> {
	const params: Record<string, string> = {};
	if (prefix) params.prefix = prefix;
	return api.get<TranslationsResponse>(`/translations/${lang}`, params);
}

// ── Translation editor (Tools → Translations) ──
//
// A separate `/i18n` surface, not more routes under `/translations`. That
// prefix is unauthenticated by design (the login screen needs its strings
// before anyone signs in), and it backfills gaps from English — which the
// editor must not do, or "missing in fr" becomes indistinguishable from
// "translated to the same words as English".

/** Where a cell's current value came from. This distinction is the feature. */
export type TranslationState = 'shipped' | 'overridden' | 'missing';

export interface TranslationCell {
	/** Null only when `state` is `missing`. */
	value: string | null;
	state: TranslationState;
	/** What the source ships, so an override can show what it replaced. */
	shipped: string | null;
}

export interface TranslationRow {
	key: string;
	/** First dot-notation segment, e.g. `THEME_TYPHOON`. */
	namespace: string;
	sourceValue: string | null;
	/** Provider ids contributing this key, lowest to highest precedence. */
	providers: string[];
	/** Provider whose value wins, or null when only an override defines it. */
	owner: string | null;
	/** False when no plugin, theme or core file ships this key — likely a typo. */
	known: boolean;
	values: Record<string, TranslationCell>;
}

export type TranslationProviderKind = 'system' | 'plugin' | 'theme' | 'user';

export interface TranslationNamespace {
	name: string;
	keyCount: number;
}

export interface TranslationProvider {
	id: string;
	kind: TranslationProviderKind;
	slug: string;
	label: string;
	/** Plugin enabled, or theme active. Disabled sources never win a key. */
	enabled: boolean;
	keyCount: number;
	namespaces: TranslationNamespace[];
}

export interface TranslationLanguage {
	code: string;
	hasOverrides: boolean;
}

export interface TranslationCoverage {
	code: string;
	total: number;
	translated: number;
	missing: number;
	overridden: number;
}

export interface TranslationKeysPage {
	rows: TranslationRow[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}

export interface TranslationKeysQuery {
	sourceLang: string;
	langs: string[];
	q?: string;
	provider?: string;
	namespace?: string;
	status?: 'all' | TranslationState | 'unknown';
	page?: number;
	perPage?: number;
}

export interface TranslationPatchResult {
	written: Record<string, string>;
	removed: string[];
	/** Sets that matched the shipped value and were dropped rather than stored. */
	reverted: string[];
	/** Keys no source ships — saved anyway, but worth warning about. */
	unknown: string[];
	rows: TranslationRow[];
}

export interface TranslationReplaceResult {
	count: number;
	dropped: string[];
	unknown: string[];
	/** Overrides that existed in the edited scope and are now gone. */
	removed: number;
}

export interface TranslationOverridesYaml {
	lang: string;
	scoped: boolean;
	namespace: string | null;
	count: number;
	yaml: string;
}

interface RawCell {
	value: string | null;
	state: TranslationState;
	shipped: string | null;
}

interface RawRow {
	key: string;
	namespace: string;
	source_value: string | null;
	providers: string[];
	owner: string | null;
	known: boolean;
	values: Record<string, RawCell>;
}

function toRow(raw: RawRow): TranslationRow {
	return {
		key: raw.key,
		namespace: raw.namespace,
		sourceValue: raw.source_value,
		providers: raw.providers ?? [],
		owner: raw.owner,
		known: raw.known,
		values: raw.values ?? {},
	};
}

export async function getTranslationLanguages(): Promise<{
	default: string;
	languages: TranslationLanguage[];
}> {
	const body = await api.get<{
		default: string;
		languages: { code: string; has_overrides: boolean }[];
	}>('/i18n/languages');
	return {
		default: body.default,
		languages: (body.languages ?? []).map((l) => ({
			code: l.code,
			hasOverrides: l.has_overrides,
		})),
	};
}

export async function getTranslationSources(lang: string): Promise<TranslationProvider[]> {
	const body = await api.get<{
		providers: {
			id: string;
			kind: TranslationProviderKind;
			slug: string;
			label: string;
			enabled: boolean;
			key_count: number;
			namespaces: { name: string; key_count: number }[];
		}[];
	}>('/i18n/sources', { lang });
	return (body.providers ?? []).map((p) => ({
		id: p.id,
		kind: p.kind,
		slug: p.slug,
		label: p.label,
		enabled: p.enabled,
		keyCount: p.key_count,
		namespaces: (p.namespaces ?? []).map((n) => ({ name: n.name, keyCount: n.key_count })),
	}));
}

export async function getTranslationCoverage(sourceLang: string): Promise<TranslationCoverage[]> {
	const body = await api.get<{ coverage: TranslationCoverage[] }>('/i18n/coverage', {
		source_lang: sourceLang,
	});
	return body.coverage ?? [];
}

export async function getTranslationKeys(query: TranslationKeysQuery): Promise<TranslationKeysPage> {
	const params: Record<string, string> = {
		source_lang: query.sourceLang,
		langs: query.langs.join(','),
		page: String(query.page ?? 1),
		per_page: String(query.perPage ?? 50),
	};
	if (query.q) params.q = query.q;
	if (query.provider) params.provider = query.provider;
	if (query.namespace) params.namespace = query.namespace;
	if (query.status && query.status !== 'all') params.status = query.status;

	const body = await api.getFullBody<{
		data?: RawRow[];
		meta?: {
			pagination?: { total?: number; page?: number; per_page?: number; total_pages?: number };
		};
	}>('/i18n/keys', params);

	const rows = (body.data ?? []).map(toRow);
	const meta = body.meta?.pagination ?? {};
	return {
		rows,
		total: meta.total ?? rows.length,
		page: meta.page ?? query.page ?? 1,
		perPage: meta.per_page ?? query.perPage ?? 50,
		totalPages: meta.total_pages ?? 1,
	};
}

export async function getTranslationKey(key: string, sourceLang: string): Promise<TranslationRow> {
	const raw = await api.get<RawRow>(`/i18n/keys/${encodeURIComponent(key)}`, {
		source_lang: sourceLang,
	});
	return toRow(raw);
}

/**
 * Apply inline edits. A `set` whose value equals the shipped one comes back in
 * `reverted` and is not stored — an override identical to the source is noise
 * that silently rots when the plugin rewords.
 */
export async function patchTranslationOverrides(
	lang: string,
	set: Record<string, string>,
	unset: string[] = [],
	sourceLang?: string
): Promise<TranslationPatchResult> {
	const suffix = sourceLang ? `?source_lang=${encodeURIComponent(sourceLang)}` : '';
	const raw = await api.patch<Omit<TranslationPatchResult, 'rows'> & { rows: RawRow[] }>(
		`/i18n/overrides/${lang}${suffix}`,
		{ set, unset }
	);
	return { ...raw, rows: (raw.rows ?? []).map(toRow) };
}

export async function getTranslationOverridesYaml(
	lang: string,
	namespace?: string
): Promise<TranslationOverridesYaml> {
	const params: Record<string, string> = {};
	if (namespace) params.namespace = namespace;
	return api.get<TranslationOverridesYaml>(`/i18n/overrides/${lang}`, params);
}

/** Why a key came back without a proposal. */
export type TranslationProposalReason =
	| 'no_source'
	| 'icu_needs_human'
	| 'nothing_to_translate'
	| 'provider_returned_nothing'
	| 'placeholders_mangled';

export interface TranslationProposal {
	key: string;
	source: string | null;
	/** Null whenever `ok` is false. */
	value: string | null;
	ok: boolean;
	reason: TranslationProposalReason | null;
}

/** Why machine translation isn't usable, when it isn't. */
export type TranslateUnavailableReason = 'not_installed' | 'not_enabled' | 'not_configured';

export interface TranslateStatus {
	available: boolean;
	installed: boolean;
	enabled: boolean;
	/** Null when available. Each reason needs a different next step. */
	reason: TranslateUnavailableReason | null;
	maxKeys: number;
}

export async function getTranslateStatus(): Promise<TranslateStatus> {
	const body = await api.get<{
		available: boolean;
		installed: boolean;
		enabled: boolean;
		reason: TranslateUnavailableReason | null;
		max_keys: number;
	}>('/i18n/translate');
	return {
		available: body.available,
		installed: body.installed,
		enabled: body.enabled,
		reason: body.reason,
		maxKeys: body.max_keys,
	};
}

/**
 * Ask for machine translations. This never writes — proposals come back for
 * review and are committed through the normal patch, because bulk machine
 * translation is exactly where an unreviewed write does real damage.
 */
export async function proposeTranslations(
	sourceLang: string,
	targetLang: string,
	keys: string[]
): Promise<TranslationProposal[]> {
	const body = await api.post<{ proposals: TranslationProposal[] }>('/i18n/translate', {
		source_lang: sourceLang,
		target_lang: targetLang,
		keys,
	});
	return body.proposals ?? [];
}

/**
 * Whole-file save, or — with `namespace` — a save scoped to one namespace that
 * leaves every other override in the file untouched. Always pass the namespace
 * the YAML was read with, or saving a filtered view deletes what it wasn't
 * showing.
 */
export async function replaceTranslationOverrides(
	lang: string,
	yaml: string,
	namespace?: string | null
): Promise<TranslationReplaceResult> {
	return api.put<TranslationReplaceResult>(`/i18n/overrides/${lang}`, {
		yaml,
		...(namespace ? { namespace } : {}),
	});
}

// ─── migrating off the translation-strings plugin ──────────────────────

export type ImportKeyStatus = 'new' | 'already' | 'conflict' | 'shipped';

export interface TranslationStringsImportKey {
	key: string;
	status: ImportKeyStatus;
	unknown: boolean;
	/** What user/languages currently holds for this key, if anything. */
	current: string | null;
	value: string;
}

export interface TranslationStringsImportLanguage {
	code: string;
	total: number;
	new: number;
	already: number;
	conflict: number;
	shipped: number;
	unknown: number;
	/** Truncated for display; the counts above are exact. */
	keys: TranslationStringsImportKey[];
}

export interface TranslationStringsImportStatus {
	present: boolean;
	/** While true the old plugin merges last and still beats this editor. */
	plugin_enabled: boolean;
	config_path: string;
	/** Overrides that importing would actually change: new + conflict. */
	pending: number;
	total: number;
	languages: TranslationStringsImportLanguage[];
}

export interface TranslationStringsImportResult {
	imported: number;
	reverted: number;
	unknown: string[];
	plugin_enabled: boolean;
	languages: { code: string; written: number; reverted: number; unknown: number; path: string }[];
}

/** What the old translation-strings plugin is holding, and what importing would do. */
export async function getTranslationStringsImportStatus(): Promise<TranslationStringsImportStatus> {
	return api.get<TranslationStringsImportStatus>('/i18n/import/translation-strings');
}

/**
 * Copy those overrides into user/languages. Does not disable the plugin —
 * that's a separate config write the caller makes once this has succeeded, so
 * the only half-finished state is the harmless one.
 */
export async function importTranslationStrings(): Promise<TranslationStringsImportResult> {
	return api.post<TranslationStringsImportResult>('/i18n/import/translation-strings', {});
}
