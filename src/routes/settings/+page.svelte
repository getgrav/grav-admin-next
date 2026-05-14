<script lang="ts">
	import { prefs, FONT_OPTIONS, FONT_SIZE_OPTIONS, type FontSize, type MenubarLink, type PagesViewMode } from '$lib/stores/preferences.svelte';
	import { theme, ACCENT_PRESETS } from '$lib/stores/theme.svelte';
	import { branding } from '$lib/stores/branding.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { saveSitePreferences, type LogoMode, type PreferenceValues, type SiteSettings } from '$lib/api/endpoints/preferences';
	import { getAdminLanguages, type AdminLanguageInfo } from '$lib/api/endpoints/languages';
	import { flushNow } from '$lib/stores/_serverSync';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import InlineIconPicker from '$lib/components/ui/InlineIconPicker.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import {
		RotateCcw, Plus, Trash2, GripVertical, Upload, Shield
	} from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import SegmentedToggle from '$lib/components/ui/SegmentedToggle.svelte';

	type SiteDraft = Partial<PreferenceValues> & Partial<SiteSettings>;

	let confirmResetOpen = $state(false);
	let customOpen = $state(!ACCENT_PRESETS.some(p => p.hue === theme.accentHue && p.saturation === theme.accentSaturation));

	// Locales the admin can render in. Enumerated server-side from
	// admin2/languages/*.yaml so the dropdown reflects reality instead of a
	// hardcoded list. English fallback covers the case where the API call
	// hasn't returned yet or fails outright.
	let adminLanguages = $state<AdminLanguageInfo[]>([
		{ code: 'en', name: 'English', native_name: 'English', rtl: false },
	]);
	$effect(() => {
		getAdminLanguages()
			.then((res) => { if (res.languages?.length) adminLanguages = res.languages; })
			.catch(() => { /* keep English fallback */ });
	});

	// ── Site branding (super-admin only, live save) ──────────────────────────
	async function setLogoMode(mode: LogoMode) {
		try { await branding.save({ mode }); } catch { toast.error(i18n.t('ADMIN_NEXT.SETTINGS.FAILED_TO_SAVE_LOGO_MODE')); }
	}

	async function setLogoText(text: string) {
		try { await branding.save({ text }); } catch { toast.error(i18n.t('ADMIN_NEXT.SETTINGS.FAILED_TO_SAVE_LOGO_TEXT')); }
	}

	async function handleLogoUpload(variant: 'light' | 'dark', event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			await branding.uploadLogo(variant, file);
			toast.success(i18n.t(
				variant === 'light' ? 'ADMIN_NEXT.SETTINGS.LIGHT_LOGO_UPLOADED' : 'ADMIN_NEXT.SETTINGS.DARK_LOGO_UPLOADED'
			));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SETTINGS.LOGO_UPLOAD_FAILED'));
		}
		input.value = '';
	}

	async function deleteLogo(variant: 'light' | 'dark') {
		try {
			await branding.deleteLogo(variant);
			toast.success(i18n.t(
				variant === 'light' ? 'ADMIN_NEXT.SETTINGS.LIGHT_LOGO_REMOVED' : 'ADMIN_NEXT.SETTINGS.DARK_LOGO_REMOVED'
			));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SETTINGS.FAILED_TO_REMOVE_LOGO'));
		}
	}

	// ── Site defaults draft (super-admin only) ───────────────────────────────
	// Single draft spans Tier B (per-user-overridable defaults) and Tier A2
	// (site-only behavioral). The backend routes each key to the appropriate
	// yaml destination when we PATCH /admin-next/preferences/site.
	let siteDraft = $state<SiteDraft>({});
	let siteCustomAccentOpen = $state(false);

	function siteHue(): number { return siteDraft.accentHue ?? 271; }
	function siteSat(): number { return siteDraft.accentSaturation ?? 91; }
	function setSiteAccent(hue: number, saturation: number) {
		siteDraft = { ...siteDraft, accentHue: hue, accentSaturation: saturation };
	}

	function resetSiteDraft() {
		// Build the next draft from a local snapshot, not the $state proxy,
		// to avoid re-triggering the parent $effect on our own writes.
		const nextDefaults = { ...prefs.siteDefaults };
		const nextSettings = { ...prefs.siteSettings };
		const merged: SiteDraft = { ...nextDefaults, ...nextSettings };
		// Clone the menubar links array so user edits don't mutate the source.
		merged.menubarLinks = Array.isArray(nextSettings.menubarLinks)
			? nextSettings.menubarLinks.map(l => ({ ...l }))
			: [];
		const hue = merged.accentHue ?? 271;
		const sat = merged.accentSaturation ?? 91;
		siteDraft = merged;
		siteCustomAccentOpen = !ACCENT_PRESETS.some(p => p.hue === hue && p.saturation === sat);
	}

	$effect(() => {
		if (prefs.loaded) resetSiteDraft();
	});

	async function saveSiteDefaults() {
		try {
			const resp = await saveSitePreferences(siteDraft);
			prefs.init(resp);
			toast.success(i18n.t('ADMIN_NEXT.SETTINGS.SITE_DEFAULTS_SAVED'));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SETTINGS.FAILED_TO_SAVE_SITE_DEFAULTS'));
		}
	}

	// Menubar links editor inside the site-defaults draft.
	function addSiteLink() {
		const list = Array.isArray(siteDraft.menubarLinks) ? siteDraft.menubarLinks : [];
		siteDraft = { ...siteDraft, menubarLinks: [...list, { label: '', url: '', external: true }] };
	}
	function removeSiteLink(index: number) {
		const list = Array.isArray(siteDraft.menubarLinks) ? siteDraft.menubarLinks : [];
		siteDraft = { ...siteDraft, menubarLinks: list.filter((_, i) => i !== index) };
	}
	function updateSiteLink(index: number, field: keyof MenubarLink, value: string | boolean) {
		const list = Array.isArray(siteDraft.menubarLinks) ? siteDraft.menubarLinks : [];
		siteDraft = {
			...siteDraft,
			menubarLinks: list.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
		};
	}

	// ── Per-user actions ─────────────────────────────────────────────────────
	function handleLanguageChange(lang: string) {
		prefs.adminLanguage = lang;
		i18n.setLanguage(lang);
		// Bypass the debounce: language is a single decisive action and a
		// quick logout-after-change would otherwise lose it.
		void flushNow();
		const display = adminLanguages.find((l) => l.code === lang)?.native_name ?? lang;
		toast.success(i18n.t('ADMIN_NEXT.SETTINGS.LANGUAGE_CHANGED', { language: display }));
	}

	function resetPreferences() {
		confirmResetOpen = true;
	}

	async function confirmReset() {
		confirmResetOpen = false;
		try {
			await prefs.resetAllToSiteDefaults();
			theme.setColorMode(prefs.siteDefaults.colorMode ?? '');
			theme.setAccent(
				prefs.siteDefaults.accentHue ?? 271,
				prefs.siteDefaults.accentSaturation ?? 91,
			);
			toast.success(i18n.t('ADMIN_NEXT.SETTINGS.PREFERENCES_RESET_RELOAD_TO_APPLY'));
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.SETTINGS.FAILED_TO_RESET_PREFERENCES'));
		}
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.SETTINGS.SETTINGS_GRAV_ADMIN')}</title>
</svelte:head>

<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">{i18n.t('ADMIN_NEXT.NAV.SETTINGS')}</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ADMIN_PREFERENCES_AND_APPEARANCE')}</p>
						{/if}
					</div>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<div class="relative z-0 space-y-4 px-6 pb-6">

		<!-- Appearance — per user (Tier B) -->
		<div class="rounded-xl border border-border bg-muted/30">
			<div class="px-6 pt-6 pb-2">
				<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.APPEARANCE')}</h3>
				<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CUSTOMIZE_THE_LOOK_AND_FEEL_OF_THE_ADMIN')}</p>
			</div>
			<div class="space-y-5 px-6 py-5">
				<!-- Color Mode -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.COLOR_MODE')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CHOOSE_BETWEEN_LIGHT_AND_DARK_APPEARANCE')}</p>
					</div>
					<div>
						<SegmentedToggle
							value={theme.isDark ? 'dark' : 'light'}
							onchange={(v) => theme.setColorMode(v as 'light' | 'dark')}
							options={[
								{ value: 'light', label: i18n.t('ADMIN_NEXT.SETTINGS.LIGHT') },
								{ value: 'dark', label: i18n.t('ADMIN_NEXT.SETTINGS.DARK') }
							]}
						/>
					</div>
				</div>

				<!-- Accent Color -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ACCENT_COLOR')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.PRIMARY_COLOR_USED_FOR_BUTTONS_LINKS')}</p>
					</div>
					<div class="space-y-3">
						<div class="flex flex-wrap gap-2">
							{#each ACCENT_PRESETS as preset (preset.label)}
								{@const isActive = !customOpen && theme.accentHue === preset.hue && theme.accentSaturation === preset.saturation}
								<button
									type="button"
									class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors
										{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
									onclick={() => { customOpen = false; theme.setAccent(preset.hue, preset.saturation); }}
									title={preset.label}
								>
									<span
										class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
										style="background: hsl({preset.hue} {preset.saturation}% 55%)"
									></span>
									{preset.label}
								</button>
							{/each}
							<button
								type="button"
								class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors
									{customOpen || !ACCENT_PRESETS.some(p => p.hue === theme.accentHue && p.saturation === theme.accentSaturation) ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
								onclick={() => customOpen = !customOpen}
								title={i18n.t('ADMIN_NEXT.CUSTOM')}
							>
								<span
									class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
									style="background: conic-gradient(from 0deg, hsl(0 80% 55%), hsl(60 80% 55%), hsl(120 80% 55%), hsl(180 80% 55%), hsl(240 80% 55%), hsl(300 80% 55%), hsl(360 80% 55%))"
								></span>
								{i18n.t('ADMIN_NEXT.CUSTOM')}
							</button>
						</div>

						{#if customOpen || !ACCENT_PRESETS.some(p => p.hue === theme.accentHue && p.saturation === theme.accentSaturation)}
							<div class="rounded-md border border-border bg-background/50 p-4 space-y-3">
								<div class="flex items-center gap-3">
									<label for="hue-slider" class="w-20 shrink-0 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.HUE')}</label>
									<input
										id="hue-slider"
										type="range" min="0" max="360" step="1"
										value={theme.accentHue}
										class="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
										style="background: linear-gradient(to right, hsl(0 {theme.accentSaturation}% 55%), hsl(60 {theme.accentSaturation}% 55%), hsl(120 {theme.accentSaturation}% 55%), hsl(180 {theme.accentSaturation}% 55%), hsl(240 {theme.accentSaturation}% 55%), hsl(300 {theme.accentSaturation}% 55%), hsl(360 {theme.accentSaturation}% 55%))"
										oninput={(e) => theme.setAccent(Number((e.target as HTMLInputElement).value), theme.accentSaturation)}
									/>
									<span class="w-10 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{theme.accentHue}°</span>
								</div>
								<div class="flex items-center gap-3">
									<label for="sat-slider" class="w-20 shrink-0 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SATURATION')}</label>
									<input
										id="sat-slider"
										type="range" min="0" max="100" step="1"
										value={theme.accentSaturation}
										class="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
										style="background: linear-gradient(to right, hsl({theme.accentHue} 0% 55%), hsl({theme.accentHue} 100% 55%))"
										oninput={(e) => theme.setAccent(theme.accentHue, Number((e.target as HTMLInputElement).value))}
									/>
									<span class="w-10 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{theme.accentSaturation}%</span>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Font -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.FONT')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.TYPEFACE_USED_THROUGHOUT_THE_ADMIN')}</p>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each FONT_OPTIONS as font (font.value)}
							{@const isActive = prefs.fontFamily === font.value}
							<button
								type="button"
								class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors
									{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
								style="font-family: {font.stack}"
								onclick={() => prefs.fontFamily = font.value}
								title={font.label}
							>
								{font.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Font Size -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.FONT_SIZE')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.TEXT_SIZE_USED_THROUGHOUT_THE_ADMIN')}</p>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each FONT_SIZE_OPTIONS as size (size.value)}
							{@const isActive = prefs.fontSize === size.value}
							<button
								type="button"
								class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors
									{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
								onclick={() => prefs.fontSize = size.value as FontSize}
								title={i18n.t(`ADMIN_NEXT.SETTINGS.FONT_SIZE_${size.value.toUpperCase()}`)}
							>
								{i18n.t(`ADMIN_NEXT.SETTINGS.FONT_SIZE_${size.value.toUpperCase()}`)}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Pages — per user (Tier B) -->
		<div class="rounded-xl border border-border bg-muted/30">
			<div class="px-6 pt-6 pb-2">
				<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.PAGES.TITLE')}</h3>
				<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_SETTINGS_FOR_THE_PAGE_BROWSER')}</p>
			</div>
			<div class="space-y-5 px-6 py-5">
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_VIEW')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.HOW_PAGES_ARE_DISPLAYED_BY_DEFAULT')}</p>
					</div>
					<div>
						<SegmentedToggle
							value={prefs.pagesViewMode}
							onchange={(v) => prefs.pagesViewMode = v as PagesViewMode}
							options={[
								{ value: 'tree', label: i18n.t('ADMIN_NEXT.PAGES.VIEW_TREE') },
								{ value: 'list', label: i18n.t('ADMIN_NEXT.PAGES.VIEW_LIST') },
								{ value: 'miller', label: i18n.t('ADMIN_NEXT.PAGES.VIEW_COLUMNS') }
							]}
						/>
					</div>
				</div>

				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ITEMS_PER_PAGE')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.NUMBER_OF_PAGES_SHOWN_IN_LIST_VIEW')}</p>
					</div>
					<select
						class="flex h-9 max-w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={prefs.pagesPerPage}
						onchange={(e) => prefs.pagesPerPage = Number((e.target as HTMLSelectElement).value)}
					>
						<option value={10}>10</option>
						<option value={20}>20</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
					</select>
				</div>
			</div>
		</div>

		<!-- Language — per user (Tier B) -->
		<div class="rounded-xl border border-border bg-muted/30">
			<div class="px-6 pt-6 pb-2">
				<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.PAGES.INFO_LANGUAGE')}</h3>
				<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ADMIN_INTERFACE_LANGUAGE')}</p>
			</div>
			<div class="space-y-5 px-6 py-5">
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ADMIN_LANGUAGE')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ADMIN_LANGUAGE_DESC', { count: i18n.count })}</p>
					</div>
					<select
						class="flex h-9 max-w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={prefs.adminLanguage}
						onchange={(e) => handleLanguageChange((e.target as HTMLSelectElement).value)}
					>
						{#each adminLanguages as lang (lang.code)}
							<option value={lang.code}>{lang.native_name}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- Connection (info only) -->
		<div class="rounded-xl border border-border bg-muted/30">
			<div class="px-6 pt-6 pb-2">
				<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CONNECTION')}</h3>
				<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SERVER_CONNECTION_DETAILS')}</p>
			</div>
			<div class="space-y-5 px-6 py-5">
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SERVER_URL')}</span>
					</div>
					<div class="flex h-9 max-w-96 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
						{auth.serverUrl}
					</div>
				</div>
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ENVIRONMENT')}</span>
					</div>
					<div class="flex h-9 max-w-40 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
						{auth.environment || 'default'}
					</div>
				</div>
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.AUTHENTICATED_AS')}</span>
					</div>
					<div class="flex h-9 max-w-48 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
						{auth.username}
					</div>
				</div>
			</div>
		</div>

		<!-- Reset all user overrides -->
		<div class="flex justify-end">
			<Button variant="outline" onclick={resetPreferences}>
				<RotateCcw size={14} />
				{i18n.t('ADMIN_NEXT.SETTINGS.RESET_TO_SITE_DEFAULTS')}
			</Button>
		</div>

		<!-- ── Site Defaults (super-admin only) ───────────────────────────── -->
		{#if prefs.canEditSite}
			<div class="rounded-xl border-2 border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/20">
				<div class="px-6 pt-6 pb-2">
					<div class="flex items-center gap-2">
						<Shield size={16} class="text-amber-700 dark:text-amber-400" />
						<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SITE_DEFAULTS')}</h3>
					</div>
					<p class="mt-1 text-sm text-muted-foreground">
						{i18n.t('ADMIN_NEXT.SETTINGS.SITE_DEFAULTS_DESCRIPTION')}
					</p>
				</div>

				<div class="space-y-6 px-6 py-5">
					<!-- Branding card (live save) -->
					<div class="space-y-4 rounded-lg border border-border bg-card/50 p-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<h4 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.BRANDING')}</h4>
								<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.BRANDING_DESC')}</p>
							</div>
							<span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SAVED_AUTOMATICALLY')}</span>
						</div>

						<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
							<div class="lg:pt-2.5">
								<span class="text-xs font-medium text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.LOGO_TYPE')}</span>
							</div>
							<div>
								<SegmentedToggle
									value={branding.mode}
									onchange={(v) => setLogoMode(v as LogoMode)}
									options={[
										{ value: 'default', label: i18n.t('ADMIN_NEXT.SETTINGS.GRAV_LOGO') },
										{ value: 'text', label: i18n.t('ADMIN_NEXT.SETTINGS.CUSTOM_TEXT') },
										{ value: 'custom', label: i18n.t('ADMIN_NEXT.SETTINGS.CUSTOM_IMAGE') }
									]}
								/>
							</div>
						</div>

						<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
							<div class="lg:pt-2.5">
								<span class="text-xs font-medium text-foreground">{i18n.t('ADMIN_NEXT.PREVIEW')}</span>
							</div>
							<div class="flex items-center gap-2 rounded-md border border-border bg-card p-3 max-w-fit">
								<BrandLogo size="sidebar" showLabel={true} />
							</div>
						</div>

						{#if branding.mode === 'text'}
							<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
								<div class="lg:pt-2.5">
									<span class="text-xs font-medium text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.LOGO_TEXT')}</span>
									<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.THE_FIRST_LETTER_BECOMES_THE_ICON')}</p>
								</div>
								<input
									type="text"
									class="flex h-10 w-full max-w-xs rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									value={branding.text}
									placeholder="Grav"
									onblur={(e) => setLogoText((e.target as HTMLInputElement).value)}
								/>
							</div>
						{/if}

						{#if branding.mode === 'custom'}
							<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
								<div class="lg:pt-2.5">
									<span class="text-xs font-medium text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.LIGHT_MODE_LOGO')}</span>
								</div>
								<div class="flex items-center gap-3">
									{#if branding.urlLight}
										{@const lightSrc = (typeof window !== 'undefined' ? ((window as unknown as { __GRAV_CONFIG__?: { serverUrl?: string } }).__GRAV_CONFIG__?.serverUrl ?? '') : '') + branding.urlLight}
										<img src={lightSrc} alt="Light logo" class="h-8 w-auto rounded border border-border bg-white p-1" />
										<button
											type="button"
											class="text-xs text-muted-foreground hover:text-destructive"
											onclick={() => deleteLogo('light')}
										>{i18n.t('ADMIN_NEXT.REMOVE')}</button>
									{/if}
									<label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50">
										<Upload size={14} />
										{i18n.t('ADMIN_NEXT.UPLOAD')}
										<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" class="hidden" onchange={(e) => handleLogoUpload('light', e)} />
									</label>
								</div>
							</div>
							<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
								<div class="lg:pt-2.5">
									<span class="text-xs font-medium text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DARK_MODE_LOGO')}</span>
								</div>
								<div class="flex items-center gap-3">
									{#if branding.urlDark}
										{@const darkSrc = (typeof window !== 'undefined' ? ((window as unknown as { __GRAV_CONFIG__?: { serverUrl?: string } }).__GRAV_CONFIG__?.serverUrl ?? '') : '') + branding.urlDark}
										<img src={darkSrc} alt="Dark logo" class="h-8 w-auto rounded border border-border bg-zinc-900 p-1" />
										<button
											type="button"
											class="text-xs text-muted-foreground hover:text-destructive"
											onclick={() => deleteLogo('dark')}
										>{i18n.t('ADMIN_NEXT.REMOVE')}</button>
									{/if}
									<label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50">
										<Upload size={14} />
										{i18n.t('ADMIN_NEXT.UPLOAD')}
										<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" class="hidden" onchange={(e) => handleLogoUpload('dark', e)} />
									</label>
								</div>
							</div>
						{/if}
					</div>

					<!-- Site Settings card (draft + save) ────────────────────── -->
					<div class="rounded-lg border border-border bg-card/50">
						<div class="border-b border-border px-6 pt-5 pb-4">
							<h4 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SITE_SETTINGS_HEADING')}</h4>
							<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SITE_SETTINGS_DESC')}</p>
						</div>

						<div class="space-y-8 px-6 py-5">
							<!-- ─── Appearance defaults (Tier B) ───────────────── -->
							<div class="space-y-5">
								<div class="flex items-baseline justify-between border-b border-border/60 pb-2">
									<h5 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_APPEARANCE')}</h5>
									<span class="text-[0.625rem] text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SETTINGS.USERS_MAY_OVERRIDE')}</span>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.COLOR_MODE')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_COLOR_APPEARANCE_DESC')}</p>
									</div>
									<div>
										<SegmentedToggle
											value={siteDraft.colorMode ?? ''}
											onchange={(v) => siteDraft = { ...siteDraft, colorMode: v as '' | 'light' | 'dark' }}
											options={[
												{ value: '', label: i18n.t('ADMIN_NEXT.SETTINGS.FOLLOW_OS') },
												{ value: 'light', label: i18n.t('ADMIN_NEXT.SETTINGS.LIGHT') },
												{ value: 'dark', label: i18n.t('ADMIN_NEXT.SETTINGS.DARK') }
											]}
										/>
									</div>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ACCENT_COLOR')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_PRIMARY_COLOR_DESC')}</p>
									</div>
									<div class="space-y-3">
										<div class="flex flex-wrap gap-2">
											{#each ACCENT_PRESETS as preset (preset.label)}
												{@const isActive = !siteCustomAccentOpen && siteHue() === preset.hue && siteSat() === preset.saturation}
												<button
													type="button"
													class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors
														{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
													onclick={() => { siteCustomAccentOpen = false; setSiteAccent(preset.hue, preset.saturation); }}
													title={preset.label}
												>
													<span class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style="background: hsl({preset.hue} {preset.saturation}% 55%)"></span>
													{preset.label}
												</button>
											{/each}
											<button
												type="button"
												class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors
													{siteCustomAccentOpen || !ACCENT_PRESETS.some(p => p.hue === siteHue() && p.saturation === siteSat()) ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
												onclick={() => siteCustomAccentOpen = !siteCustomAccentOpen}
												title={i18n.t('ADMIN_NEXT.CUSTOM')}
											>
												<span class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style="background: conic-gradient(from 0deg, hsl(0 80% 55%), hsl(60 80% 55%), hsl(120 80% 55%), hsl(180 80% 55%), hsl(240 80% 55%), hsl(300 80% 55%), hsl(360 80% 55%))"></span>
												{i18n.t('ADMIN_NEXT.CUSTOM')}
											</button>
										</div>

										{#if siteCustomAccentOpen || !ACCENT_PRESETS.some(p => p.hue === siteHue() && p.saturation === siteSat())}
											<div class="rounded-md border border-border bg-background/50 p-4 space-y-3">
												<div class="flex items-center gap-3">
													<label for="site-hue-slider" class="w-20 shrink-0 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.HUE')}</label>
													<input id="site-hue-slider" type="range" min="0" max="360" step="1"
														value={siteHue()}
														class="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
														style="background: linear-gradient(to right, hsl(0 {siteSat()}% 55%), hsl(60 {siteSat()}% 55%), hsl(120 {siteSat()}% 55%), hsl(180 {siteSat()}% 55%), hsl(240 {siteSat()}% 55%), hsl(300 {siteSat()}% 55%), hsl(360 {siteSat()}% 55%))"
														oninput={(e) => setSiteAccent(Number((e.target as HTMLInputElement).value), siteSat())}
													/>
													<span class="w-10 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{siteHue()}°</span>
												</div>
												<div class="flex items-center gap-3">
													<label for="site-sat-slider" class="w-20 shrink-0 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SATURATION')}</label>
													<input id="site-sat-slider" type="range" min="0" max="100" step="1"
														value={siteSat()}
														class="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
														style="background: linear-gradient(to right, hsl({siteHue()} 0% 55%), hsl({siteHue()} 100% 55%))"
														oninput={(e) => setSiteAccent(siteHue(), Number((e.target as HTMLInputElement).value))}
													/>
													<span class="w-10 shrink-0 text-end text-xs tabular-nums text-muted-foreground">{siteSat()}%</span>
												</div>
											</div>
										{/if}
									</div>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.FONT')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_TYPEFACE_DESC')}</p>
									</div>
									<div class="flex flex-wrap gap-2">
										{#each FONT_OPTIONS as font (font.value)}
											{@const isActive = (siteDraft.fontFamily ?? 'google-sans') === font.value}
											<button
												type="button"
												class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors
													{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
												style="font-family: {font.stack}"
												onclick={() => siteDraft = { ...siteDraft, fontFamily: font.value }}
												title={font.label}
											>
												{font.label}
											</button>
										{/each}
									</div>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.FONT_SIZE')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_TEXT_SIZE_DESC')}</p>
									</div>
									<div class="flex flex-wrap gap-2">
										{#each FONT_SIZE_OPTIONS as size (size.value)}
											{@const isActive = (siteDraft.fontSize ?? 'normal') === size.value}
											<button
												type="button"
												class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors
													{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
												onclick={() => siteDraft = { ...siteDraft, fontSize: size.value as FontSize }}
												title={i18n.t(`ADMIN_NEXT.SETTINGS.FONT_SIZE_${size.value.toUpperCase()}`)}
											>
												{i18n.t(`ADMIN_NEXT.SETTINGS.FONT_SIZE_${size.value.toUpperCase()}`)}
											</button>
										{/each}
									</div>
								</div>
							</div>

							<!-- ─── Pages defaults (Tier B) ────────────────────── -->
							<div class="space-y-5">
								<div class="flex items-baseline justify-between border-b border-border/60 pb-2">
									<h5 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_PAGES')}</h5>
									<span class="text-[0.625rem] text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SETTINGS.USERS_MAY_OVERRIDE')}</span>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_VIEW')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.HOW_PAGES_ARE_DISPLAYED_BY_DEFAULT')}</p>
									</div>
									<div>
										<SegmentedToggle
											value={siteDraft.pagesViewMode ?? 'tree'}
											onchange={(v) => siteDraft = { ...siteDraft, pagesViewMode: v as PagesViewMode }}
											options={[
												{ value: 'tree', label: i18n.t('ADMIN_NEXT.PAGES.VIEW_TREE') },
												{ value: 'list', label: i18n.t('ADMIN_NEXT.PAGES.VIEW_LIST') },
												{ value: 'miller', label: i18n.t('ADMIN_NEXT.PAGES.VIEW_COLUMNS') }
											]}
										/>
									</div>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ITEMS_PER_PAGE')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.NUMBER_OF_PAGES_SHOWN_IN_LIST_VIEW')}</p>
									</div>
									<select
										class="flex h-9 max-w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										value={siteDraft.pagesPerPage ?? 20}
										onchange={(e) => siteDraft = { ...siteDraft, pagesPerPage: Number((e.target as HTMLSelectElement).value) }}
									>
										<option value={10}>10</option>
										<option value={20}>20</option>
										<option value={50}>50</option>
										<option value={100}>100</option>
									</select>
								</div>
							</div>

							<!-- ─── Language default (Tier B) ──────────────────── -->
							<div class="space-y-5">
								<div class="flex items-baseline justify-between border-b border-border/60 pb-2">
									<h5 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_LANGUAGE')}</h5>
									<span class="text-[0.625rem] text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SETTINGS.USERS_MAY_OVERRIDE')}</span>
								</div>
								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.ADMIN_LANGUAGE')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_INTERFACE_LANGUAGE_DESC')}</p>
									</div>
									<select
										class="flex h-9 max-w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										value={siteDraft.adminLanguage ?? 'en'}
										onchange={(e) => siteDraft = { ...siteDraft, adminLanguage: (e.target as HTMLSelectElement).value }}
									>
										{#each adminLanguages as lang (lang.code)}
											<option value={lang.code}>{lang.native_name}</option>
										{/each}
									</select>
								</div>
							</div>

							<!-- ─── Editor mode (Tier B) ───────────────────────── -->
							<div class="space-y-5">
								<div class="flex items-baseline justify-between border-b border-border/60 pb-2">
									<h5 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.EDITOR_HEADING')}</h5>
									<span class="text-[0.625rem] text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SETTINGS.USERS_MAY_OVERRIDE')}</span>
								</div>
								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.EDITOR_MODE')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_FORM_EDITOR_DENSITY')}</p>
									</div>
									<div>
										<SegmentedToggle
											value={siteDraft.editorMode ?? 'normal'}
											onchange={(v) => siteDraft = { ...siteDraft, editorMode: v as 'normal' | 'expert' }}
											options={[
												{ value: 'normal', label: i18n.t('ADMIN_NEXT.PAGES.MODE_NORMAL') },
												{ value: 'expert', label: i18n.t('ADMIN_NEXT.PAGES.MODE_EXPERT') }
											]}
										/>
									</div>
								</div>
							</div>

							<!-- ─── Editing (Tier A2 site-only) ────────────────── -->
							<div class="space-y-5">
								<div class="flex items-baseline justify-between border-b border-border/60 pb-2">
									<h5 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.EDITING')}</h5>
									<span class="text-[0.625rem] text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SETTINGS.SITE_WIDE_ONLY')}</span>
								</div>

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.AUTO_SAVE')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.AUTOMATICALLY_SAVE_WHEN_YOU_LEAVE_A')}</p>
									</div>
									<div>
										<SegmentedToggle
											value={siteDraft.autoSaveEnabled ?? false}
											onchange={(v) => siteDraft = { ...siteDraft, autoSaveEnabled: v as boolean }}
											options={[
												{ value: false, label: i18n.t('ADMIN_NEXT.SETTINGS.OFF') },
												{ value: true, label: i18n.t('ADMIN_NEXT.SETTINGS.ON') }
											]}
										/>
									</div>
								</div>

								{#if siteDraft.autoSaveEnabled}
									<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
										<div class="lg:pt-2.5">
											<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.TOOLBAR_UNDO_BUTTON')}</span>
											<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SHOW_AN_UNDO_BUTTON_IN_THE_EDITOR')}</p>
										</div>
										<div>
											<SegmentedToggle
												value={siteDraft.autoSaveToolbarUndo ?? true}
												onchange={(v) => siteDraft = { ...siteDraft, autoSaveToolbarUndo: v as boolean }}
												options={[
													{ value: false, label: i18n.t('ADMIN_NEXT.SETTINGS.OFF') },
													{ value: true, label: i18n.t('ADMIN_NEXT.SETTINGS.ON') }
												]}
											/>
										</div>
									</div>

									<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
										<div class="lg:pt-2.5">
											<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.UNDO_BATCH_WINDOW')}</span>
											<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.GROUP_RAPID_FIELD_CHANGES_INTO_A_SINGLE')}</p>
										</div>
										<select
											class="flex h-9 max-w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
											value={siteDraft.autoSaveBatchWindowMs ?? 0}
											onchange={(e) => siteDraft = { ...siteDraft, autoSaveBatchWindowMs: Number((e.target as HTMLSelectElement).value) }}
										>
											<option value={0}>{i18n.t('ADMIN_NEXT.SETTINGS.NONE_1_FIELD_1_UNDO')}</option>
											<option value={500}>500ms</option>
											<option value={1000}>{i18n.t('ADMIN_NEXT.SETTINGS.1_SECOND')}</option>
											<option value={2000}>{i18n.t('ADMIN_NEXT.SETTINGS.2_SECONDS')}</option>
										</select>
									</div>
								{/if}

								<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
									<div class="lg:pt-2.5">
										<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.REAL_TIME_COLLABORATION')}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">{@html i18n.tHtml('ADMIN_NEXT.SETTINGS.COLLAB_DESCRIPTION')}</p>
									</div>
									<div>
										<SegmentedToggle
											value={siteDraft.collabEnabled ?? true}
											onchange={(v) => siteDraft = { ...siteDraft, collabEnabled: v as boolean }}
											options={[
												{ value: false, label: i18n.t('ADMIN_NEXT.SETTINGS.OFF') },
												{ value: true, label: i18n.t('ADMIN_NEXT.SETTINGS.ON') }
											]}
										/>
									</div>
								</div>
							</div>

							<!-- ─── Menubar Links (Tier A2 site-only) ──────────── -->
							<div class="space-y-5">
								<div class="flex items-baseline justify-between border-b border-border/60 pb-2">
									<h5 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.MENUBAR_LINKS')}</h5>
									<span class="text-[0.625rem] text-muted-foreground/70">{i18n.t('ADMIN_NEXT.SETTINGS.SITE_WIDE_ONLY')}</span>
								</div>
								<p class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CUSTOM_SHORTCUTS_SHOWN_IN_THE_TOP')}</p>
								<div class="space-y-3">
									{#each (siteDraft.menubarLinks ?? []) as link, i}
										<div class="flex items-center gap-2">
											<GripVertical size={14} class="shrink-0 text-muted-foreground/40" />
											<InlineIconPicker
												value={link.icon ?? ''}
												onchange={(v) => updateSiteLink(i, 'icon', v)}
											/>
											<input
												type="text"
												class="flex h-9 w-28 rounded-md border border-input bg-muted/50 px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
												placeholder="Label"
												value={link.label}
												oninput={(e) => updateSiteLink(i, 'label', (e.target as HTMLInputElement).value)}
											/>
											<input
												type="url"
												class="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-muted/50 px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
												placeholder="https://..."
												value={link.url}
												oninput={(e) => updateSiteLink(i, 'url', (e.target as HTMLInputElement).value)}
											/>
											<label class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
												<input
													type="checkbox"
													class="h-3.5 w-3.5 rounded border-input accent-primary"
													checked={link.external ?? true}
													onchange={(e) => updateSiteLink(i, 'external', (e.target as HTMLInputElement).checked)}
												/>
												{i18n.t('ADMIN_NEXT.SETTINGS.EXTERNAL')}
											</label>
											<button
												type="button"
												class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
												onclick={() => removeSiteLink(i)}
												title={i18n.t('ADMIN_NEXT.SETTINGS.REMOVE_LINK')}
											>
												<Trash2 size={14} />
											</button>
										</div>
									{/each}
									<button
										type="button"
										class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
										onclick={addSiteLink}
									>
										<Plus size={14} />
										{i18n.t('ADMIN_NEXT.SETTINGS.ADD_LINK')}
									</button>
								</div>
							</div>
						</div>

						<div class="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">
							<Button variant="outline" size="sm" onclick={resetSiteDraft}>{i18n.t('ADMIN_NEXT.SETTINGS.REVERT_CHANGES')}</Button>
							<Button size="sm" onclick={saveSiteDefaults}>{i18n.t('ADMIN_NEXT.SETTINGS.SAVE_SITE_DEFAULTS')}</Button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<ConfirmModal
	open={confirmResetOpen}
	title={i18n.t('ADMIN_NEXT.SETTINGS.RESET_PREFERENCES')}
	message={i18n.t('ADMIN_NEXT.SETTINGS.RESET_PREFERENCES_MSG')}
	confirmLabel={i18n.t('ADMIN_NEXT.SETTINGS.RESET')}
	variant="destructive"
	onconfirm={confirmReset}
	oncancel={() => { confirmResetOpen = false; }}
/>
