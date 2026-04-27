<script lang="ts">
	import { prefs, type MenubarLink, type LogoMode, FONT_OPTIONS } from '$lib/stores/preferences.svelte';
	import { theme, ACCENT_PRESETS } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import InlineIconPicker from '$lib/components/ui/InlineIconPicker.svelte';
	import BrandLogo from '$lib/components/ui/BrandLogo.svelte';
	import {
		RotateCcw, Plus, Trash2, GripVertical, Upload
	} from 'lucide-svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';

	let confirmResetOpen = $state(false);
	let customOpen = $state(!ACCENT_PRESETS.some(p => p.hue === theme.accentHue && p.saturation === theme.accentSaturation));

	// Logo settings
	function setLogoMode(mode: LogoMode) {
		prefs.logo = { ...prefs.logo, mode };
	}

	function setLogoText(text: string) {
		prefs.logo = { ...prefs.logo, text };
	}

	function handleLogoUpload(variant: 'customLight' | 'customDark', event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			prefs.logo = { ...prefs.logo, [variant]: reader.result as string };
		};
		reader.readAsDataURL(file);
	}

	// Menubar links editing
	let editingLinks = $state<MenubarLink[]>([...prefs.menubarLinks]);

	function addLink() {
		editingLinks = [...editingLinks, { label: '', url: '', external: true }];
	}

	function removeLink(index: number) {
		editingLinks = editingLinks.filter((_, i) => i !== index);
		prefs.menubarLinks = editingLinks;
	}

	function updateLink(index: number, field: keyof MenubarLink, value: string | boolean) {
		editingLinks = editingLinks.map((link, i) =>
			i === index ? { ...link, [field]: value } : link
		);
		prefs.menubarLinks = editingLinks;
	}

	function handleLanguageChange(lang: string) {
		prefs.adminLanguage = lang;
		i18n.setLanguage(lang);
		toast.success(`Language changed to ${lang}`);
	}

	function resetPreferences() {
		confirmResetOpen = true;
	}

	function confirmReset() {
		confirmResetOpen = false;
		localStorage.removeItem('grav_admin_prefs');
		localStorage.removeItem('grav_admin_theme');
		toast.success(i18n.t('ADMIN_NEXT.SETTINGS.PREFERENCES_RESET_RELOAD_TO_APPLY'));
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
		<!-- Logo -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">Logo</h3>
			<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CUSTOMIZE_THE_LOGO_SHOWN_IN_THE_SIDEBAR')}</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Logo Mode -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.LOGO_TYPE')}</span>
					<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CHOOSE_HOW_THE_LOGO_IS_DISPLAYED')}</p>
				</div>
				<div>
					<div class="inline-flex rounded-md border border-border shadow-sm">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 text-sm font-medium transition-colors
								{prefs.logo.mode === 'default' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => setLogoMode('default')}
						>
							{i18n.t('ADMIN_NEXT.SETTINGS.GRAV_LOGO')}
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors
								{prefs.logo.mode === 'text' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => setLogoMode('text')}
						>
							{i18n.t('ADMIN_NEXT.SETTINGS.CUSTOM_TEXT')}
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-r-md px-3 text-sm font-medium transition-colors
								{prefs.logo.mode === 'custom' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => setLogoMode('custom')}
						>
							{i18n.t('ADMIN_NEXT.SETTINGS.CUSTOM_IMAGE')}
						</button>
					</div>
				</div>
			</div>

			<!-- Text input (only for text mode) -->
			{#if prefs.logo.mode === 'text'}
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.LOGO_TEXT')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.THE_FIRST_LETTER_BECOMES_THE_ICON')}</p>
					</div>
					<div>
						<input
							type="text"
							class="flex h-10 w-full max-w-xs rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							value={prefs.logo.text}
							placeholder="Grav"
							oninput={(e) => setLogoText((e.target as HTMLInputElement).value)}
						/>
					</div>
				</div>
			{/if}

			<!-- Image uploads (only for custom mode) -->
			{#if prefs.logo.mode === 'custom'}
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.LIGHT_MODE_LOGO')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.USED_ON_LIGHT_BACKGROUNDS')}</p>
					</div>
					<div class="flex items-center gap-3">
						{#if prefs.logo.customLight}
							<img src={prefs.logo.customLight} alt={i18n.t('ADMIN_NEXT.SETTINGS.LIGHT_LOGO')} class="h-8 w-auto rounded border border-border bg-white p-1" />
						{/if}
						<label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50">
							<Upload size={14} />
							{i18n.t('ADMIN_NEXT.UPLOAD')}
							<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" class="hidden" onchange={(e) => handleLogoUpload('customLight', e)} />
						</label>
					</div>
				</div>
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DARK_MODE_LOGO')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.USED_ON_DARK_BACKGROUNDS')}</p>
					</div>
					<div class="flex items-center gap-3">
						{#if prefs.logo.customDark}
							<img src={prefs.logo.customDark} alt={i18n.t('ADMIN_NEXT.SETTINGS.DARK_LOGO')} class="h-8 w-auto rounded border border-border bg-zinc-900 p-1" />
						{/if}
						<label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50">
							<Upload size={14} />
							{i18n.t('ADMIN_NEXT.UPLOAD')}
							<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" class="hidden" onchange={(e) => handleLogoUpload('customDark', e)} />
						</label>
					</div>
				</div>
			{/if}

			<!-- Preview -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.PREVIEW')}</span>
				</div>
				<div class="flex items-center gap-6">
					<div class="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
						<BrandLogo size="sidebar" showLabel={true} />
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Appearance -->
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
					<div class="inline-flex rounded-md border border-border shadow-sm">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 text-sm font-medium transition-colors
								{!theme.isDark ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => theme.setColorMode('light')}
						>
							Light
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-r-md px-3 text-sm font-medium transition-colors
								{theme.isDark ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => theme.setColorMode('dark')}
						>
							Dark
						</button>
					</div>
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
								<label for="hue-slider" class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Hue</label>
								<input
									id="hue-slider"
									type="range"
									min="0"
									max="360"
									step="1"
									value={theme.accentHue}
									class="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
									style="background: linear-gradient(to right, hsl(0 {theme.accentSaturation}% 55%), hsl(60 {theme.accentSaturation}% 55%), hsl(120 {theme.accentSaturation}% 55%), hsl(180 {theme.accentSaturation}% 55%), hsl(240 {theme.accentSaturation}% 55%), hsl(300 {theme.accentSaturation}% 55%), hsl(360 {theme.accentSaturation}% 55%))"
									oninput={(e) => theme.setAccent(Number((e.target as HTMLInputElement).value), theme.accentSaturation)}
								/>
								<span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{theme.accentHue}°</span>
							</div>
							<div class="flex items-center gap-3">
								<label for="sat-slider" class="w-20 shrink-0 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SATURATION')}</label>
								<input
									id="sat-slider"
									type="range"
									min="0"
									max="100"
									step="1"
									value={theme.accentSaturation}
									class="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
									style="background: linear-gradient(to right, hsl({theme.accentHue} 0% 55%), hsl({theme.accentHue} 100% 55%))"
									oninput={(e) => theme.setAccent(theme.accentHue, Number((e.target as HTMLInputElement).value))}
								/>
								<span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{theme.accentSaturation}%</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Font -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Font</span>
					<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.TYPEFACE_USED_THROUGHOUT_THE_ADMIN')}</p>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each FONT_OPTIONS as font (font.value)}
						{@const isActive = prefs.fontFamily === font.value}
						<button
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
		</div>
	</div>

	<!-- Pages -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">Pages</h3>
			<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_SETTINGS_FOR_THE_PAGE_BROWSER')}</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Default View Mode -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.DEFAULT_VIEW')}</span>
					<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.HOW_PAGES_ARE_DISPLAYED_BY_DEFAULT')}</p>
				</div>
				<div>
					<div class="inline-flex rounded-md border border-border shadow-sm">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 text-sm font-medium transition-colors
								{prefs.pagesViewMode === 'tree' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.pagesViewMode = 'tree'}
						>
							Tree
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors
								{prefs.pagesViewMode === 'list' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.pagesViewMode = 'list'}
						>
							List
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-r-md px-3 text-sm font-medium transition-colors
								{prefs.pagesViewMode === 'miller' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.pagesViewMode = 'miller'}
						>
							{i18n.t('ADMIN_NEXT.PAGES.VIEW_COLUMNS')}
						</button>
					</div>
				</div>
			</div>

			<!-- Items per Page -->
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

	<!-- Editing -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.EDITING')}</h3>
			<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.AUTO_SAVE_AND_UNDO_BEHAVIOR_FOR_FORM')}</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Auto-Save Toggle -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.AUTO_SAVE')}</span>
					<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.AUTOMATICALLY_SAVE_WHEN_YOU_LEAVE_A')}</p>
				</div>
				<div>
					<div class="inline-flex rounded-md border border-border shadow-sm">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 text-sm font-medium transition-colors
								{!prefs.autoSaveEnabled ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.autoSaveEnabled = false}
						>
							Off
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-r-md px-3 text-sm font-medium transition-colors
								{prefs.autoSaveEnabled ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.autoSaveEnabled = true}
						>
							On
						</button>
					</div>
				</div>
			</div>

			{#if prefs.autoSaveEnabled}
				<!-- Show Toolbar Undo -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.TOOLBAR_UNDO_BUTTON')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.SHOW_AN_UNDO_BUTTON_IN_THE_EDITOR')}</p>
					</div>
					<div class="flex items-center pt-2.5">
						<label class="flex cursor-pointer items-center gap-2.5">
							<input
								type="checkbox"
								class="h-[18px] w-[18px] shrink-0 appearance-none rounded border border-input bg-muted/50 accent-primary checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-no-repeat checked:bg-center"
								checked={prefs.autoSaveToolbarUndo}
								onchange={(e) => prefs.autoSaveToolbarUndo = (e.target as HTMLInputElement).checked}
							/>
							<span class="text-sm text-foreground">{i18n.t('ADMIN_NEXT.ENABLED')}</span>
						</label>
					</div>
				</div>

				<!-- Batch Window -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.UNDO_BATCH_WINDOW')}</span>
						<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.GROUP_RAPID_FIELD_CHANGES_INTO_A_SINGLE')}</p>
					</div>
					<select
						class="flex h-9 max-w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={prefs.autoSaveBatchWindowMs}
						onchange={(e) => prefs.autoSaveBatchWindowMs = Number((e.target as HTMLSelectElement).value)}
					>
						<option value={0}>{i18n.t('ADMIN_NEXT.SETTINGS.NONE_1_FIELD_1_UNDO')}</option>
						<option value={500}>500ms</option>
						<option value={1000}>{i18n.t('ADMIN_NEXT.SETTINGS.1_SECOND')}</option>
						<option value={2000}>{i18n.t('ADMIN_NEXT.SETTINGS.2_SECONDS')}</option>
					</select>
				</div>
			{/if}

			<!-- Real-time Collaboration (experimental) -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.REAL_TIME_COLLABORATION')}</span>
					<p class="mt-0.5 text-xs text-muted-foreground">
						{@html i18n.tHtml('ADMIN_NEXT.SETTINGS.COLLAB_DESCRIPTION')}
					</p>
				</div>
				<div>
					<div class="inline-flex rounded-md border border-border shadow-sm">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 text-sm font-medium transition-colors
								{!prefs.collabEnabled ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.collabEnabled = false}
						>
							Off
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-r-md px-3 text-sm font-medium transition-colors
								{prefs.collabEnabled ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => prefs.collabEnabled = true}
						>
							On
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Language -->
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
					<option value="en">{i18n.t('ADMIN_NEXT.SETTINGS.ENGLISH')}</option>
					<option value="fr">{i18n.t('ADMIN_NEXT.SETTINGS.FRAN_AIS')}</option>
					<option value="de">{i18n.t('ADMIN_NEXT.SETTINGS.DEUTSCH')}</option>
					<option value="es">{i18n.t('ADMIN_NEXT.SETTINGS.ESPA_OL')}</option>
					<option value="it">{i18n.t('ADMIN_NEXT.SETTINGS.ITALIANO')}</option>
					<option value="pt">{i18n.t('ADMIN_NEXT.SETTINGS.PORTUGU_S')}</option>
					<option value="nl">{i18n.t('ADMIN_NEXT.SETTINGS.NEDERLANDS')}</option>
					<option value="ru">Русский</option>
					<option value="ja">日本語</option>
					<option value="zh">中文</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Menubar Links -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.MENUBAR_LINKS')}</h3>
			<p class="mt-1 text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CUSTOM_SHORTCUTS_SHOWN_IN_THE_TOP')}</p>
		</div>
		<div class="space-y-3 px-6 py-5">
			{#each editingLinks as link, i}
				<div class="flex items-center gap-2">
					<GripVertical size={14} class="shrink-0 text-muted-foreground/40" />
					<InlineIconPicker
						value={link.icon ?? ''}
						onchange={(v) => updateLink(i, 'icon', v)}
					/>
					<input
						type="text"
						class="flex h-9 w-28 rounded-md border border-input bg-muted/50 px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="Label"
						value={link.label}
						oninput={(e) => updateLink(i, 'label', (e.target as HTMLInputElement).value)}
					/>
					<input
						type="url"
						class="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-muted/50 px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="https://..."
						value={link.url}
						oninput={(e) => updateLink(i, 'url', (e.target as HTMLInputElement).value)}
					/>
					<label class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
						<input
							type="checkbox"
							class="h-3.5 w-3.5 rounded border-input accent-primary"
							checked={link.external ?? true}
							onchange={(e) => updateLink(i, 'external', (e.target as HTMLInputElement).checked)}
						/>
						{i18n.t('ADMIN_NEXT.SETTINGS.EXTERNAL')}
					</label>
					<button
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onclick={() => removeLink(i)}
						title={i18n.t('ADMIN_NEXT.SETTINGS.REMOVE_LINK')}
					>
						<Trash2 size={14} />
					</button>
				</div>
			{/each}
			<button
				class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				onclick={addLink}
			>
				<Plus size={14} />
				{i18n.t('ADMIN_NEXT.SETTINGS.ADD_LINK')}
			</button>
		</div>
	</div>

	<!-- Connection -->
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

	<!-- Reset -->
	<div class="flex justify-end">
		<Button variant="outline" onclick={resetPreferences}>
			<RotateCcw size={14} />
			{i18n.t('ADMIN_NEXT.SETTINGS.RESET_ALL_PREFERENCES')}
		</Button>
	</div>
	</div>
</div>

<ConfirmModal
	open={confirmResetOpen}
	title={i18n.t('ADMIN_NEXT.SETTINGS.RESET_PREFERENCES')}
	message="Reset all admin preferences to defaults?"
	confirmLabel="Reset"
	variant="destructive"
	onconfirm={confirmReset}
	oncancel={() => { confirmResetOpen = false; }}
/>
