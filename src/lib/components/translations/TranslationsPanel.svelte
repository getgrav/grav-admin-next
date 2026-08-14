<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Search, X, RefreshCw, Boxes, Palette, Server, Pencil, ChevronDown, Code2, Table2, TriangleAlert, Languages } from 'lucide-svelte';
	import {
		getTranslationLanguages,
		getTranslationSources,
		getTranslationCoverage,
		getTranslationKeys,
		patchTranslationOverrides,
		getTranslationOverridesYaml,
		replaceTranslationOverrides,
		getTranslateStatus,
		proposeTranslations,
		type TranslationProposal,
		type TranslationProvider,
		type TranslationProviderKind,
		type TranslationLanguage,
		type TranslationCoverage,
		type TranslationRow,
		type TranslationState,
		type TranslateStatus,
	} from '$lib/api/endpoints/translations';
	import TranslationCell from './TranslationCell.svelte';

	// ── state ────────────────────────────────────────────────────────

	let languages = $state<TranslationLanguage[]>([]);
	let coverage = $state<Record<string, TranslationCoverage>>({});
	let providers = $state<TranslationProvider[]>([]);
	let rows = $state<TranslationRow[]>([]);

	let sourceLang = $state('en');
	let targetLangs = $state<string[]>([]);
	let provider = $state<string | null>(null);
	let namespace = $state<string | null>(null);
	let status = $state<'all' | TranslationState | 'unknown'>('all');
	let searchInput = $state('');
	let search = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	let page = $state(1);
	let perPage = $state(50);
	let total = $state(0);
	let loading = $state(true);
	let booting = $state(true);
	let langPickerOpen = $state(false);
	let langFilter = $state('');
	let langPickerEl = $state<HTMLElement | null>(null);
	let expandedProviders = $state<Set<string>>(new Set());

	const totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	/** Columns are the source language first, then whatever else is selected. */
	const columns = $derived([sourceLang, ...targetLangs.filter((l) => l !== sourceLang)]);

	const kindOrder: TranslationProviderKind[] = ['system', 'plugin', 'theme', 'user'];

	const kindLabels: Record<TranslationProviderKind, string> = {
		system: 'ADMIN_NEXT.TRANSLATIONS.KIND_SYSTEM',
		plugin: 'ADMIN_NEXT.TRANSLATIONS.KIND_PLUGINS',
		theme: 'ADMIN_NEXT.TRANSLATIONS.KIND_THEMES',
		user: 'ADMIN_NEXT.TRANSLATIONS.KIND_USER',
	};

	const kindIcons = { system: Server, plugin: Boxes, theme: Palette, user: Pencil };

	/** Providers bucketed by kind, so the browse pane reads as a tree. */
	const providerGroups = $derived(
		kindOrder
			.map((kind) => ({
				kind,
				items: providers.filter((p) => p.kind === kind),
			}))
			.filter((g) => g.items.length > 0)
	);

	const filteredLanguages = $derived(
		langFilter.trim() === ''
			? languages
			: languages.filter((l) => l.code.toLowerCase().includes(langFilter.trim().toLowerCase()))
	);

	/**
	 * Every narrowing currently applied, as removable chips.
	 *
	 * Without this a source picked earlier in the session keeps filtering
	 * silently — the tree scrolls, the selection goes out of view, and an empty
	 * grid reads as "search is broken" rather than "you are inside AI Pro".
	 */
	const activeFilters = $derived(
		[
			provider
				? {
						id: 'provider',
						label: providers.find((p) => p.id === provider)?.label ?? provider,
						clear: () => selectProvider(null),
					}
				: null,
			namespace
				? { id: 'namespace', label: namespace, clear: () => { namespace = null; resetAndLoad(); } }
				: null,
			search
				? { id: 'search', label: `“${search}”`, clear: clearSearch }
				: null,
			status !== 'all'
				? {
						id: 'status',
						label: i18n.t(`ADMIN_NEXT.TRANSLATIONS.STATUS_${status.toUpperCase()}`),
						clear: () => setStatus('all'),
					}
				: null,
		].filter((f) => f !== null)
	);

	function clearAllFilters() {
		provider = null;
		namespace = null;
		status = 'all';
		searchInput = '';
		search = '';
		resetAndLoad();
	}

	// ── loading ──────────────────────────────────────────────────────

	/**
	 * Guards against out-of-order responses. Toggling several languages fires a
	 * request each, and a slower earlier one landing last repaints stale rows —
	 * which makes the tool report a language as untranslated when it isn't.
	 */
	let loadToken = 0;

	async function loadRows() {
		const token = ++loadToken;
		loading = true;
		try {
			const result = await getTranslationKeys({
				sourceLang,
				langs: columns,
				q: search || undefined,
				provider: provider ?? undefined,
				namespace: namespace ?? undefined,
				status,
				page,
				perPage,
			});
			if (token !== loadToken) return;
			rows = result.rows;
			total = result.total;
			page = result.page;
		} catch {
			if (token !== loadToken) return;
			toast.error(i18n.t('ADMIN_NEXT.TRANSLATIONS.FAILED_TO_LOAD'));
			rows = [];
			total = 0;
		} finally {
			// Only the newest request owns the spinner, or a stale one turns it
			// off while the current fetch is still running.
			if (token === loadToken) loading = false;
		}
	}

	async function loadSources() {
		try {
			providers = await getTranslationSources(sourceLang);
		} catch {
			providers = [];
		}
	}

	async function loadCoverage() {
		try {
			const list = await getTranslationCoverage(sourceLang);
			coverage = Object.fromEntries(list.map((c) => [c.code, c]));
		} catch {
			coverage = {};
		}
	}

	function resetAndLoad() {
		page = 1;
		loadRows();
	}

	// ── filters ──────────────────────────────────────────────────────

	function handleSearchInput(e: Event) {
		searchInput = (e.target as HTMLInputElement).value;
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			search = searchInput;
			resetAndLoad();
		}, 350);
	}

	function clearSearch() {
		searchInput = '';
		search = '';
		resetAndLoad();
	}

	function selectProvider(id: string | null) {
		provider = provider === id ? null : id;
		namespace = null;
		resetAndLoad();
	}

	function selectNamespace(providerId: string, ns: string) {
		provider = providerId;
		namespace = namespace === ns ? null : ns;
		resetAndLoad();
	}

	function toggleProviderExpanded(id: string) {
		const next = new Set(expandedProviders);
		next.has(id) ? next.delete(id) : next.add(id);
		expandedProviders = next;
	}

	function setStatus(next: typeof status) {
		status = next;
		resetAndLoad();
	}

	function toggleLanguage(code: string) {
		if (code === sourceLang) return;
		targetLangs = targetLangs.includes(code)
			? targetLangs.filter((c) => c !== code)
			: [...targetLangs, code];
		resetAndLoad();
	}

	async function changeSourceLang(code: string) {
		sourceLang = code;
		targetLangs = targetLangs.filter((c) => c !== code);
		page = 1;
		await Promise.all([loadSources(), loadCoverage()]);
		await loadRows();
	}

	function goToPage(p: number) {
		page = Math.min(Math.max(1, p), totalPages);
		loadRows();
	}

	// ── editing ──────────────────────────────────────────────────────

	/**
	 * Persist one cell. The server decides whether this is an override or a
	 * revert — a value equal to what the source ships is stored as neither, so
	 * we always trust the row it sends back rather than assuming.
	 */
	async function saveCell(key: string, lang: string, value: string | null) {
		try {
			const result =
				value === null
					? await patchTranslationOverrides(lang, {}, [key], sourceLang)
					: await patchTranslationOverrides(lang, { [key]: value }, [], sourceLang);

			applyRows(result.rows, lang);

			if (result.reverted.includes(key)) {
				toast.success(i18n.t('ADMIN_NEXT.TRANSLATIONS.REVERTED_TO_SHIPPED'));
			} else if (value === null) {
				toast.success(i18n.t('ADMIN_NEXT.TRANSLATIONS.OVERRIDE_REMOVED'));
			} else if (result.unknown.includes(key)) {
				toast.warning(i18n.t('ADMIN_NEXT.TRANSLATIONS.SAVED_UNKNOWN_KEY', { key }));
			}

			loadCoverage();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TRANSLATIONS.FAILED_TO_SAVE'));
			// Re-read so the grid never shows an edit the server rejected.
			loadRows();
		}
	}

	/** Merge the server's post-save rows into the grid without a full refetch. */
	function applyRows(updated: TranslationRow[], lang: string) {
		if (updated.length === 0) return;
		const byKey = new Map(updated.map((r) => [r.key, r]));
		rows = rows.map((row) => {
			const next = byKey.get(row.key);
			if (!next) return row;
			return {
				...row,
				known: next.known,
				providers: next.providers,
				owner: next.owner,
				sourceValue: lang === sourceLang ? next.sourceValue : row.sourceValue,
				values: { ...row.values, ...next.values },
			};
		});
	}

	// ── machine translation ──────────────────────────────────────────
	//
	// Proposals are staged, never written. A bulk run over a whole column is
	// where an unreviewed machine translation does real damage, so nothing
	// reaches disk until it is accepted.

	let translateStatus = $state<TranslateStatus | null>(null);
	const translateAvailable = $derived(translateStatus?.available === true);
	let translating = $state(false);

	/**
	 * Machine translation is unavailable for one of three reasons and each has
	 * a different next step, so the controls stay visible and say which it is
	 * rather than vanishing and leaving the feature undiscoverable.
	 */
	const translateUnavailableText = $derived(
		translateAvailable
			? ''
			: i18n.t(
					`ADMIN_NEXT.TRANSLATIONS.TRANSLATE_UNAVAILABLE_${(
						translateStatus?.reason ?? 'not_installed'
					).toUpperCase()}`
				)
	);

	/**
	 * Says why, and offers the way there, rather than navigating on the spot.
	 * Clicking a greyed control in the middle of a long list and being moved to
	 * another screen loses your place for something you may only have been
	 * curious about.
	 */
	function goToTranslatePlugin() {
		const reason = translateStatus?.reason ?? 'not_installed';
		// Not installed: open the Add Plugin dialog already filtered to it.
		// Otherwise it is on disk, so its own page is where it gets switched on
		// or given a provider key.
		const href =
			reason === 'not_installed'
				? `${base}/plugins?install=ai-translate`
				: `${base}/plugins/ai-translate`;

		toast.info(translateUnavailableText, {
			duration: 8000,
			action: {
				label: i18n.t(
					reason === 'not_installed'
						? 'ADMIN_NEXT.TRANSLATIONS.TRANSLATE_UNAVAILABLE_FIND_IT'
						: 'ADMIN_NEXT.TRANSLATIONS.TRANSLATE_UNAVAILABLE_OPEN_IT'
				),
				onClick: () => goto(href),
			},
		});
	}
	/** key → lang → proposal, for rows currently on screen. */
	let proposals = $state<Record<string, Record<string, TranslationProposal>>>({});
	let skipped = $state<TranslationProposal[]>([]);

	const proposalCount = $derived(
		Object.values(proposals).reduce((n, byLang) => n + Object.keys(byLang).length, 0)
	);

	/** Languages we can actually translate into: the target columns. */
	const translatableColumns = $derived(columns.filter((l) => l !== sourceLang));

	async function translateVisible() {
		if (translatableColumns.length === 0) {
			toast.info(i18n.t('ADMIN_NEXT.TRANSLATIONS.PICK_A_TARGET_LANGUAGE'));
			return;
		}

		translating = true;
		skipped = [];
		const staged: Record<string, Record<string, TranslationProposal>> = { ...proposals };

		try {
			for (const lang of translatableColumns) {
				// Only what is actually missing — never re-translate over a value
				// someone already wrote.
				const keys = rows
					.filter((r) => r.values[lang]?.state === 'missing')
					.map((r) => r.key);
				if (keys.length === 0) continue;

				const result = await proposeTranslations(sourceLang, lang, keys);
				for (const p of result) {
					if (p.ok && p.value !== null) {
						staged[p.key] = { ...(staged[p.key] ?? {}), [lang]: p };
					} else {
						skipped.push(p);
					}
				}
			}

			proposals = staged;

			if (proposalCount === 0) {
				toast.info(i18n.t('ADMIN_NEXT.TRANSLATIONS.NOTHING_TO_TRANSLATE'));
			}
		} catch (err) {
			const detail = (err as { error?: { detail?: string } })?.error?.detail;
			toast.error(detail ?? i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_FAILED'));
		} finally {
			translating = false;
		}
	}

	/** `${key} ${lang}` of the cell currently awaiting a provider round trip. */
	let translatingCell = $state<string | null>(null);

	/**
	 * Why a single cell came back without a suggestion. A bulk run can quietly
	 * fold these into a "skipped" count, but a button the user just clicked has
	 * to say what happened.
	 */
	const skipReasons: Record<string, string> = {
		no_source: 'ADMIN_NEXT.TRANSLATIONS.SKIP_NO_SOURCE',
		icu_needs_human: 'ADMIN_NEXT.TRANSLATIONS.SKIP_ICU',
		nothing_to_translate: 'ADMIN_NEXT.TRANSLATIONS.SKIP_NOTHING',
		provider_returned_nothing: 'ADMIN_NEXT.TRANSLATIONS.SKIP_EMPTY',
		placeholders_mangled: 'ADMIN_NEXT.TRANSLATIONS.SKIP_PLACEHOLDERS',
	};

	/**
	 * Translate one key. From a target cell that means that one cell; from the
	 * source cell it means every open language column at once. Stages
	 * suggestions like the bulk run — never writes.
	 */
	async function translateCell(key: string, lang: string | null) {
		const targets = lang !== null ? [lang] : translatableColumns;

		if (targets.length === 0) {
			// Nothing to translate into. Say so and open the picker, rather than
			// leaving a button that appears to do nothing.
			toast.info(i18n.t('ADMIN_NEXT.TRANSLATIONS.PICK_A_TARGET_LANGUAGE'));
			langPickerOpen = true;
			return;
		}

		translatingCell = `${key} ${lang ?? '*'}`;
		const staged: Record<string, TranslationProposal> = {};
		const refused: string[] = [];

		try {
			for (const target of targets) {
				const [proposal] = await proposeTranslations(sourceLang, target, [key]);
				if (!proposal) continue;

				if (proposal.ok && proposal.value !== null) {
					staged[target] = proposal;
				} else if (proposal.reason) {
					refused.push(proposal.reason);
				}
			}

			if (Object.keys(staged).length > 0) {
				proposals = { ...proposals, [key]: { ...(proposals[key] ?? {}), ...staged } };
				return;
			}

			// A click that quietly does nothing is worse than no button, so a key
			// that produced no suggestion at all has to explain itself.
			const reasonKey = refused[0] ? skipReasons[refused[0]] : null;
			toast.warning(
				reasonKey ? i18n.t(reasonKey) : i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_FAILED')
			);
		} catch (err) {
			const detail = (err as { error?: { detail?: string } })?.error?.detail;
			toast.error(detail ?? i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_FAILED'));
		} finally {
			translatingCell = null;
		}
	}

	async function acceptProposal(key: string, lang: string) {
		const proposal = proposals[key]?.[lang];
		if (!proposal?.value) return;
		discardProposal(key, lang);
		await saveCell(key, lang, proposal.value);
	}

	function discardProposal(key: string, lang: string) {
		const next = { ...proposals };
		const byLang = { ...(next[key] ?? {}) };
		delete byLang[lang];
		if (Object.keys(byLang).length === 0) delete next[key];
		else next[key] = byLang;
		proposals = next;
	}

	async function acceptAllProposals() {
		const entries = Object.entries(proposals);
		proposals = {};

		// One patch per language rather than per cell — a column run can be
		// hundreds of keys.
		const byLang: Record<string, Record<string, string>> = {};
		for (const [key, langs] of entries) {
			for (const [lang, p] of Object.entries(langs)) {
				if (p.value === null) continue;
				(byLang[lang] ??= {})[key] = p.value;
			}
		}

		try {
			for (const [lang, set] of Object.entries(byLang)) {
				const result = await patchTranslationOverrides(lang, set, [], sourceLang);
				applyRows(result.rows, lang);
			}
			toast.success(
				i18n.t('ADMIN_NEXT.TRANSLATIONS.ACCEPTED_ALL', {
					count: Object.values(byLang).reduce((n, s) => n + Object.keys(s).length, 0),
				})
			);
			loadCoverage();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TRANSLATIONS.FAILED_TO_SAVE'));
			loadRows();
		}
	}

	function discardAllProposals() {
		proposals = {};
		skipped = [];
	}

	// ── advanced YAML mode ───────────────────────────────────────────
	//
	// A view toggle on the *current filter*, not a separate global textarea:
	// bulk paste and cell editing then act on the same data, and the namespace
	// scope travels with the save so a filtered edit can't delete the overrides
	// it wasn't showing.

	let advanced = $state(false);
	let yamlLang = $state('');
	let yamlText = $state('');
	let yamlLoaded = $state('');
	let yamlSaving = $state(false);
	let yamlWarnings = $state<string[]>([]);

	const yamlDirty = $derived(yamlText !== yamlLoaded);

	/** Advanced mode edits one language's file; default to the first column that isn't the source. */
	const yamlDefaultLang = $derived(targetLangs[0] ?? sourceLang);

	async function openAdvanced() {
		advanced = true;
		yamlLang = yamlLang || yamlDefaultLang;
		await loadYaml();
	}

	async function loadYaml() {
		yamlWarnings = [];
		try {
			const result = await getTranslationOverridesYaml(yamlLang, namespace ?? undefined);
			yamlText = result.yaml;
			yamlLoaded = result.yaml;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TRANSLATIONS.FAILED_TO_LOAD'));
		}
	}

	async function saveYaml() {
		yamlSaving = true;
		yamlWarnings = [];
		try {
			const result = await replaceTranslationOverrides(yamlLang, yamlText, namespace);
			yamlLoaded = yamlText;
			yamlWarnings = result.unknown;
			toast.success(
				i18n.t('ADMIN_NEXT.TRANSLATIONS.YAML_SAVED', {
					count: result.count,
					lang: yamlLang,
				})
			);
			loadCoverage();
			loadRows();
		} catch (err) {
			const detail = (err as { error?: { errors?: { message: string }[]; detail?: string } })?.error;
			const message = detail?.errors?.[0]?.message ?? detail?.detail;
			toast.error(message ?? i18n.t('ADMIN_NEXT.TRANSLATIONS.FAILED_TO_SAVE'));
		} finally {
			yamlSaving = false;
		}
	}

	// ── boot ─────────────────────────────────────────────────────────

	/** The picker floats over the grid, so it has to dismiss on click-away. */
	function onDocumentPointerDown(e: PointerEvent) {
		if (!langPickerOpen) return;
		if (langPickerEl && !langPickerEl.contains(e.target as Node)) {
			langPickerOpen = false;
		}
	}

	function onDocumentKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && langPickerOpen) langPickerOpen = false;
	}

	onMount(async () => {
		try {
			const langs = await getTranslationLanguages();
			languages = langs.languages;
			sourceLang = langs.default;
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TRANSLATIONS.FAILED_TO_LOAD'));
		}
		booting = false;
		try {
			translateStatus = await getTranslateStatus();
		} catch {
			translateStatus = null;
		}
		await Promise.all([loadSources(), loadCoverage()]);
		await loadRows();
	});
</script>

<svelte:document onpointerdown={onDocumentPointerDown} onkeydown={onDocumentKeydown} />

<div class="space-y-4">
	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<div class="relative">
			<Search size={14} class="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				class="h-9 rounded-md border border-input bg-background ps-8 pe-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				style="width: 280px;"
				placeholder={i18n.t('ADMIN_NEXT.TRANSLATIONS.SEARCH_PLACEHOLDER')}
				value={searchInput}
				oninput={handleSearchInput}
				onkeydown={(e) => { if (e.key === 'Escape') clearSearch(); }}
			/>
			{#if searchInput}
				<button
					class="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					onclick={clearSearch}
					aria-label={i18n.t('ADMIN_NEXT.CLEAR_SEARCH')}
				>
					<X size={14} />
				</button>
			{/if}
		</div>

		<label class="flex items-center gap-2 text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.TRANSLATIONS.SOURCE_LANGUAGE')}
			<select
				class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
				value={sourceLang}
				onchange={(e) => changeSourceLang((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each languages as lang (lang.code)}
					<option value={lang.code}>{lang.code}</option>
				{/each}
			</select>
		</label>

		<!-- Which language columns to show -->
		<div class="relative" bind:this={langPickerEl}>
			<button
				class="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-accent"
				onclick={() => (langPickerOpen = !langPickerOpen)}
				aria-expanded={langPickerOpen}
			>
				{i18n.t('ADMIN_NEXT.TRANSLATIONS.LANGUAGES')}
				{#if targetLangs.length > 0}
					<span class="rounded bg-primary/10 px-1.5 text-xs font-medium text-primary">{targetLangs.length}</span>
				{/if}
				<ChevronDown size={14} class="text-muted-foreground" />
			</button>

			{#if langPickerOpen}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute z-50 mt-1 w-72 rounded-md border border-border bg-popover p-2 shadow-lg"
					role="dialog"
					aria-label={i18n.t('ADMIN_NEXT.TRANSLATIONS.LANGUAGES')}
				>
					<input
						type="text"
						class="mb-2 h-8 w-full rounded border border-input bg-background px-2 text-sm text-foreground"
						placeholder={i18n.t('ADMIN_NEXT.TRANSLATIONS.FILTER_LANGUAGES')}
						bind:value={langFilter}
					/>
					<div class="max-h-72 overflow-y-auto">
						{#each filteredLanguages as lang (lang.code)}
							{@const cov = coverage[lang.code]}
							<label
								class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent {lang.code === sourceLang ? 'opacity-50' : ''}"
							>
								<input
									type="checkbox"
									class="accent-primary"
									disabled={lang.code === sourceLang}
									checked={lang.code === sourceLang || targetLangs.includes(lang.code)}
									onchange={() => toggleLanguage(lang.code)}
								/>
								<span class="font-mono text-xs">{lang.code}</span>
								{#if lang.hasOverrides}
									<span class="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.EDITED')}
									</span>
								{/if}
								{#if cov && cov.total > 0}
									<span class="ms-auto text-[11px] tabular-nums text-muted-foreground">
										{Math.round((cov.translated / cov.total) * 100)}%
									</span>
								{/if}
							</label>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Provenance filter. These are the three states every cell is in. -->
		<div class="flex items-center gap-1 rounded-md border border-input p-0.5">
			{#each [['all', 'ALL'], ['missing', 'MISSING'], ['overridden', 'OVERRIDDEN'], ['unknown', 'UNKNOWN']] as [value, label] (value)}
				<button
					class="rounded px-2.5 py-1 text-xs font-medium transition-colors {status === value
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => setStatus(value as typeof status)}
				>
					{i18n.t(`ADMIN_NEXT.TRANSLATIONS.STATUS_${label}`)}
				</button>
			{/each}
		</div>

		<Button variant="outline" size="sm" onclick={() => { loadSources(); loadCoverage(); loadRows(); }} disabled={loading}>
			<RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
			{i18n.t('ADMIN_NEXT.TRANSLATIONS.REFRESH')}
		</Button>

		{#if translateAvailable && !advanced}
			<Button variant="outline" size="sm" onclick={translateVisible} disabled={translating || loading}>
				<Languages size={14} class={translating ? 'animate-pulse' : ''} />
				{translating
					? i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATING')
					: i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_MISSING')}
			</Button>
		{:else if !advanced}
			<!--
				Shown greyed rather than hidden. A capability nobody knows exists
				can't be wanted, and hiding it also hides the far more common case
				of the plugin being installed but switched off or missing a
				provider key — which reads as the feature being broken.
			-->
			<Button
				variant="outline"
				size="sm"
				class="text-muted-foreground"
				onclick={goToTranslatePlugin}
				title={translateUnavailableText}
			>
				<Languages size={14} class="opacity-60" />
				{i18n.t('ADMIN_NEXT.TRANSLATIONS.TRANSLATE_MISSING')}
			</Button>
		{/if}

		<Button
			variant="outline"
			size="sm"
			class="ms-auto"
			onclick={() => (advanced ? (advanced = false) : openAdvanced())}
		>
			{#if advanced}
				<Table2 size={14} />
				{i18n.t('ADMIN_NEXT.TRANSLATIONS.EDIT_AS_GRID')}
			{:else}
				<Code2 size={14} />
				{i18n.t('ADMIN_NEXT.TRANSLATIONS.EDIT_AS_YAML')}
			{/if}
		</Button>
	</div>

	<!-- Active filters. Shown wherever the user is actually looking, because a
	     source selected earlier scrolls out of view in the tree. -->
	{#if activeFilters.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground">
				{i18n.t('ADMIN_NEXT.TRANSLATIONS.FILTERED_BY')}
			</span>
			{#each activeFilters as filter (filter.id)}
				<button
					class="flex items-center gap-1 rounded-full border border-input bg-background py-0.5 pe-1.5 ps-2.5 text-xs text-foreground hover:bg-accent"
					onclick={filter.clear}
					title={i18n.t('ADMIN_NEXT.TRANSLATIONS.REMOVE_FILTER')}
				>
					{filter.label}
					<X size={12} class="text-muted-foreground" />
				</button>
			{/each}
			{#if activeFilters.length > 1}
				<button class="text-xs text-muted-foreground hover:text-foreground hover:underline" onclick={clearAllFilters}>
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.CLEAR_ALL_FILTERS')}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Review bar: proposals are staged until accepted, never written on arrival -->
	{#if proposalCount > 0 || skipped.length > 0}
		<div class="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
			{#if proposalCount > 0}
				<span class="text-sm font-medium text-foreground">
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.PROPOSALS_PENDING', { count: proposalCount })}
				</span>
			{/if}
			{#if skipped.length > 0}
				<button
					class="flex items-center gap-1.5 text-xs text-amber-700 hover:underline dark:text-amber-300"
					title={skipped.map((s) => `${s.key}: ${s.reason}`).join('\n')}
				>
					<TriangleAlert size={13} />
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.SKIPPED_COUNT', { count: skipped.length })}
				</button>
			{/if}
			<div class="ms-auto flex items-center gap-2">
				<Button variant="outline" size="sm" onclick={discardAllProposals}>
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.DISCARD_ALL')}
				</Button>
				{#if proposalCount > 0}
					<Button size="sm" onclick={acceptAllProposals}>
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.ACCEPT_ALL')}
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex flex-col gap-4 lg:flex-row">
		<!-- Browse pane: what's changeable, before you know what to search for -->
		<aside class="w-full shrink-0 lg:w-64">
			<div class="rounded-md border border-border">
				<button
					class="flex w-full items-center justify-between border-b border-border px-3 py-2 text-xs font-medium hover:bg-accent {provider === null ? 'bg-accent' : ''}"
					onclick={() => selectProvider(null)}
				>
					<span>{i18n.t('ADMIN_NEXT.TRANSLATIONS.ALL_SOURCES')}</span>
				</button>

				<div class="max-h-[32rem] overflow-y-auto">
					{#each providerGroups as group (group.kind)}
						{@const Icon = kindIcons[group.kind]}
						<div class="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							{i18n.t(kindLabels[group.kind])}
						</div>
						{#each group.items as p (p.id)}
							<div>
								<button
									class="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-accent {provider === p.id && namespace === null ? 'bg-accent font-medium' : ''}"
									onclick={() => { selectProvider(p.id); if (p.namespaces.length > 1) toggleProviderExpanded(p.id); }}
								>
									<Icon size={13} class="shrink-0 text-muted-foreground" />
									<span class="truncate {p.enabled ? '' : 'text-muted-foreground'}" title={p.label}>
										{p.label}
									</span>
									{#if !p.enabled}
										<span
											class="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
											title={i18n.t('ADMIN_NEXT.TRANSLATIONS.INACTIVE_HELP')}
										>
											{i18n.t('ADMIN_NEXT.TRANSLATIONS.INACTIVE')}
										</span>
									{/if}
									<span class="ms-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{p.keyCount}</span>
								</button>

								{#if expandedProviders.has(p.id) && p.namespaces.length > 1}
									{#each p.namespaces as ns (ns.name)}
										<button
											class="flex w-full items-center gap-2 py-1 pe-3 ps-8 text-start text-xs hover:bg-accent {provider === p.id && namespace === ns.name ? 'bg-accent font-medium' : ''}"
											onclick={() => selectNamespace(p.id, ns.name)}
										>
											<span class="truncate font-mono">{ns.name}</span>
											<span class="ms-auto shrink-0 tabular-nums text-muted-foreground">{ns.keyCount}</span>
										</button>
									{/each}
								{/if}
							</div>
						{/each}
					{/each}
				</div>
			</div>
		</aside>

		<!-- The matrix, or the YAML view of the same filter -->
		<div class="min-w-0 flex-1">
			{#if advanced}
				<div class="space-y-3">
					<div class="flex flex-wrap items-center gap-3">
						<label class="flex items-center gap-2 text-sm text-muted-foreground">
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.EDITING_LANGUAGE')}
							<select
								class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
								value={yamlLang}
								onchange={(e) => { yamlLang = (e.currentTarget as HTMLSelectElement).value; loadYaml(); }}
							>
								{#each languages as lang (lang.code)}
									<option value={lang.code}>{lang.code}{lang.hasOverrides ? ' •' : ''}</option>
								{/each}
							</select>
						</label>

						{#if namespace}
							<span class="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
								{i18n.t('ADMIN_NEXT.TRANSLATIONS.SCOPED_TO', { namespace })}
							</span>
						{:else}
							<span class="text-xs text-muted-foreground">
								{i18n.t('ADMIN_NEXT.TRANSLATIONS.SCOPE_WHOLE_FILE')}
							</span>
						{/if}

						<Button size="sm" class="ms-auto" disabled={!yamlDirty || yamlSaving} onclick={saveYaml}>
							{yamlSaving
								? i18n.t('ADMIN_NEXT.TRANSLATIONS.SAVING')
								: i18n.t('ADMIN_NEXT.TRANSLATIONS.SAVE')}
						</Button>
					</div>

					<!-- YAML is always left-to-right, whatever direction the admin runs in. -->
					<textarea
						dir="ltr"
						spellcheck="false"
						class="h-[28rem] w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						bind:value={yamlText}
						placeholder={i18n.t('ADMIN_NEXT.TRANSLATIONS.YAML_PLACEHOLDER')}
					></textarea>

					{#if yamlWarnings.length > 0}
						<div class="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
							<div class="mb-1 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
								<TriangleAlert size={13} />
								{i18n.t('ADMIN_NEXT.TRANSLATIONS.UNKNOWN_KEYS_SAVED')}
							</div>
							<ul class="ms-4 list-disc text-muted-foreground">
								{#each yamlWarnings.slice(0, 20) as key (key)}
									<li class="font-mono">{key}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<p class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.YAML_HELP')}
					</p>
				</div>
			{:else if booting || (loading && rows.length === 0)}
				<div class="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.LOADING')}
				</div>
			{:else if rows.length === 0}
				<div class="rounded-md border border-border p-8 text-center">
					<p class="text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.NO_RESULTS')}
					</p>
					{#if activeFilters.length > 0}
						<!-- The way out has to be here, next to the empty result. -->
						<p class="mt-1 text-xs text-muted-foreground">
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.NO_RESULTS_FILTERED', {
								filters: activeFilters.map((f) => f.label).join(', '),
							})}
						</p>
						<Button variant="outline" size="sm" class="mt-3" onclick={clearAllFilters}>
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.CLEAR_ALL_FILTERS')}
						</Button>
					{/if}
				</div>
			{:else}
				<!--
					Languages stack vertically inside each row rather than becoming
					columns. A column per language cannot scale: two were already
					wrapping and clipping, and the picker offers 76. Stacking keeps the
					line length readable no matter how many are open — the row just
					gets taller, and nothing ever scrolls sideways.
				-->
				<div class="divide-y divide-border rounded-md border border-border">
					{#each rows as row (row.key)}
						<div class="grid grid-cols-1 gap-x-4 gap-y-2 p-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
							<!-- Key and provenance -->
							<div class="min-w-0">
								<div class="break-all font-mono text-xs text-foreground" title={row.key}>{row.key}</div>
								<div class="mt-0.5 flex flex-wrap items-center gap-1">
									{#if row.owner}
										<span class="text-[10px] text-muted-foreground">{row.owner}</span>
									{/if}
									{#if !row.known}
										<span
											class="rounded bg-amber-600/10 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
											title={i18n.t('ADMIN_NEXT.TRANSLATIONS.UNKNOWN_KEY_HELP')}
										>
											{i18n.t('ADMIN_NEXT.TRANSLATIONS.STATUS_UNKNOWN')}
										</span>
									{/if}
								</div>
							</div>

							<!-- One line per language -->
							<div class="flex min-w-0 flex-col gap-2">
								{#each columns as lang (lang)}
									<div class="flex min-w-0 items-start gap-2">
										<!--
											The gutter replaces the old column header: it has to say
											which language a line is, which one is the source
											everything else is translated from, and whether this one
											is actually translated. Putting the state word here
											instead of under the value keeps the row from growing a
											line per language.
										-->
										<div class="mt-1.5 w-16 shrink-0">
											<div
												class="truncate font-mono text-[11px] {lang === sourceLang
													? 'text-foreground'
													: 'text-muted-foreground'}"
												title={lang}
											>
												{lang}
											</div>
											{#if lang === sourceLang}
												<div class="text-[9px] uppercase tracking-wider text-muted-foreground/70">
													{i18n.t('ADMIN_NEXT.TRANSLATIONS.SOURCE')}
												</div>
											{:else if (row.values[lang]?.state ?? 'missing') === 'missing'}
												<div
													class="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-300"
													title={row.sourceValue !== null
														? i18n.t('ADMIN_NEXT.TRANSLATIONS.STATE_MISSING_FALLBACK')
														: i18n.t('ADMIN_NEXT.TRANSLATIONS.STATE_MISSING')}
												>
													{i18n.t('ADMIN_NEXT.TRANSLATIONS.STATUS_MISSING')}
												</div>
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<TranslationCell
												cell={row.values[lang]}
												fallback={lang === sourceLang ? null : row.sourceValue}
												proposal={proposals[row.key]?.[lang]?.value ?? null}
												canTranslate={true}
												translateDisabledReason={translateAvailable
													? null
													: translateUnavailableText}
												ontranslateunavailable={goToTranslatePlugin}
												isSource={lang === sourceLang}
												busy={translatingCell ===
													`${row.key} ${lang === sourceLang ? '*' : lang}`}
												onsave={(value) => saveCell(row.key, lang, value)}
												onaccept={() => acceptProposal(row.key, lang)}
												ondiscard={() => discardProposal(row.key, lang)}
												ontranslate={() => translateCell(row.key, lang === sourceLang ? null : lang)}
											/>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				<div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.SHOWING', {
							from: (page - 1) * perPage + 1,
							to: Math.min(page * perPage, total),
							total,
						})}
					</span>
					{#if totalPages > 1}
						<div class="flex items-center gap-2">
							<Button variant="outline" size="sm" disabled={page <= 1} onclick={() => goToPage(page - 1)}>
								{i18n.t('ADMIN_NEXT.TRANSLATIONS.PREVIOUS')}
							</Button>
							<span class="tabular-nums">{page} / {totalPages}</span>
							<Button variant="outline" size="sm" disabled={page >= totalPages} onclick={() => goToPage(page + 1)}>
								{i18n.t('ADMIN_NEXT.TRANSLATIONS.NEXT')}
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
