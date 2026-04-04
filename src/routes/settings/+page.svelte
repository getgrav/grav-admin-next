<script lang="ts">
	import { prefs, type MenubarLink, type LogoMode } from '$lib/stores/preferences.svelte';
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

	let confirmResetOpen = $state(false);

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
		toast.success('Preferences reset. Reload to apply.');
	}
</script>

<svelte:head>
	<title>Settings — Grav Admin</title>
</svelte:head>

<div class="space-y-4 p-6">
	<!-- Header -->
	<div class="flex min-h-8 items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
			<p class="mt-0.5 text-xs text-muted-foreground">Admin preferences and appearance</p>
		</div>
	</div>

	<!-- Logo -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">Logo</h3>
			<p class="mt-1 text-sm text-muted-foreground">Customize the logo shown in the sidebar and login page</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Logo Mode -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Logo Type</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Choose how the logo is displayed</p>
				</div>
				<div>
					<div class="inline-flex rounded-md border border-border shadow-sm">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-l-md px-3 text-sm font-medium transition-colors
								{prefs.logo.mode === 'default' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => setLogoMode('default')}
						>
							Grav Logo
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors
								{prefs.logo.mode === 'text' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => setLogoMode('text')}
						>
							Custom Text
						</button>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-r-md px-3 text-sm font-medium transition-colors
								{prefs.logo.mode === 'custom' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
							onclick={() => setLogoMode('custom')}
						>
							Custom Image
						</button>
					</div>
				</div>
			</div>

			<!-- Text input (only for text mode) -->
			{#if prefs.logo.mode === 'text'}
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">Logo Text</span>
						<p class="mt-0.5 text-xs text-muted-foreground">The first letter becomes the icon</p>
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
						<span class="text-sm font-semibold text-foreground">Light Mode Logo</span>
						<p class="mt-0.5 text-xs text-muted-foreground">Used on light backgrounds</p>
					</div>
					<div class="flex items-center gap-3">
						{#if prefs.logo.customLight}
							<img src={prefs.logo.customLight} alt="Light logo" class="h-8 w-auto rounded border border-border bg-white p-1" />
						{/if}
						<label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50">
							<Upload size={14} />
							Upload
							<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" class="hidden" onchange={(e) => handleLogoUpload('customLight', e)} />
						</label>
					</div>
				</div>
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">Dark Mode Logo</span>
						<p class="mt-0.5 text-xs text-muted-foreground">Used on dark backgrounds</p>
					</div>
					<div class="flex items-center gap-3">
						{#if prefs.logo.customDark}
							<img src={prefs.logo.customDark} alt="Dark logo" class="h-8 w-auto rounded border border-border bg-zinc-900 p-1" />
						{/if}
						<label class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50">
							<Upload size={14} />
							Upload
							<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" class="hidden" onchange={(e) => handleLogoUpload('customDark', e)} />
						</label>
					</div>
				</div>
			{/if}

			<!-- Preview -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Preview</span>
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
			<h3 class="text-base font-bold text-foreground">Appearance</h3>
			<p class="mt-1 text-sm text-muted-foreground">Customize the look and feel of the admin</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Color Mode -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Color Mode</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Choose between light and dark appearance</p>
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
					<span class="text-sm font-semibold text-foreground">Accent Color</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Primary color used for buttons, links, and highlights</p>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each ACCENT_PRESETS as preset (preset.label)}
						{@const isActive = theme.accentHue === preset.hue && theme.accentSaturation === preset.saturation}
						<button
							class="group relative flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors
								{isActive ? 'border-foreground/30 bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-foreground/20 hover:bg-accent/50'}"
							onclick={() => theme.setAccent(preset.hue, preset.saturation)}
							title={preset.label}
						>
							<span
								class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
								style="background: hsl({preset.hue} {preset.saturation}% 55%)"
							></span>
							{preset.label}
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
			<p class="mt-1 text-sm text-muted-foreground">Default settings for the page browser</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Default View Mode -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Default View</span>
					<p class="mt-0.5 text-xs text-muted-foreground">How pages are displayed by default</p>
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
							Columns
						</button>
					</div>
				</div>
			</div>

			<!-- Items per Page -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Items per Page</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Number of pages shown in list view</p>
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
			<h3 class="text-base font-bold text-foreground">Editing</h3>
			<p class="mt-1 text-sm text-muted-foreground">Auto-save and undo behavior for form editors</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<!-- Auto-Save Toggle -->
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Auto-Save</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Automatically save when you leave a field</p>
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
						<span class="text-sm font-semibold text-foreground">Toolbar Undo Button</span>
						<p class="mt-0.5 text-xs text-muted-foreground">Show an undo button in the editor toolbar</p>
					</div>
					<div class="flex items-center pt-2.5">
						<label class="flex cursor-pointer items-center gap-2.5">
							<input
								type="checkbox"
								class="h-[18px] w-[18px] shrink-0 appearance-none rounded border border-input bg-muted/50 accent-primary checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-no-repeat checked:bg-center"
								checked={prefs.autoSaveToolbarUndo}
								onchange={(e) => prefs.autoSaveToolbarUndo = (e.target as HTMLInputElement).checked}
							/>
							<span class="text-sm text-foreground">Enabled</span>
						</label>
					</div>
				</div>

				<!-- Batch Window -->
				<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
					<div class="lg:pt-2.5">
						<span class="text-sm font-semibold text-foreground">Undo Batch Window</span>
						<p class="mt-0.5 text-xs text-muted-foreground">Group rapid field changes into a single undo step</p>
					</div>
					<select
						class="flex h-9 max-w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={prefs.autoSaveBatchWindowMs}
						onchange={(e) => prefs.autoSaveBatchWindowMs = Number((e.target as HTMLSelectElement).value)}
					>
						<option value={0}>None (1 field = 1 undo)</option>
						<option value={500}>500ms</option>
						<option value={1000}>1 second</option>
						<option value={2000}>2 seconds</option>
					</select>
				</div>
			{/if}
		</div>
	</div>

	<!-- Language -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">Language</h3>
			<p class="mt-1 text-sm text-muted-foreground">Admin interface language</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Admin Language</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Language for labels, menus, and messages ({i18n.count} strings loaded)</p>
				</div>
				<select
					class="flex h-9 max-w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					value={prefs.adminLanguage}
					onchange={(e) => handleLanguageChange((e.target as HTMLSelectElement).value)}
				>
					<option value="en">English</option>
					<option value="fr">Fran&ccedil;ais</option>
					<option value="de">Deutsch</option>
					<option value="es">Espa&ntilde;ol</option>
					<option value="it">Italiano</option>
					<option value="pt">Portugu&ecirc;s</option>
					<option value="nl">Nederlands</option>
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
			<h3 class="text-base font-bold text-foreground">Menubar Links</h3>
			<p class="mt-1 text-sm text-muted-foreground">Custom shortcuts shown in the top menubar</p>
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
						External
					</label>
					<button
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onclick={() => removeLink(i)}
						title="Remove link"
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
				Add Link
			</button>
		</div>
	</div>

	<!-- Connection -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">Connection</h3>
			<p class="mt-1 text-sm text-muted-foreground">Server connection details</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Server URL</span>
				</div>
				<div class="flex h-9 max-w-96 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
					{auth.serverUrl}
				</div>
			</div>
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Environment</span>
				</div>
				<div class="flex h-9 max-w-40 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
					{auth.environment || 'default'}
				</div>
			</div>
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Authenticated As</span>
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
			Reset All Preferences
		</Button>
	</div>
</div>

<ConfirmModal
	open={confirmResetOpen}
	title="Reset Preferences"
	message="Reset all admin preferences to defaults?"
	confirmLabel="Reset"
	variant="destructive"
	onconfirm={confirmReset}
	oncancel={() => { confirmResetOpen = false; }}
/>
