<script lang="ts">
	import { prefs } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import {
		RotateCcw
	} from 'lucide-svelte';

	let confirmResetOpen = $state(false);

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

<div class="space-y-4 p-5">

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

	<!-- Session -->
	<div class="rounded-xl border border-border bg-muted/30">
		<div class="px-6 pt-6 pb-2">
			<h3 class="text-base font-bold text-foreground">Session</h3>
			<p class="mt-1 text-sm text-muted-foreground">Keep your session active while working</p>
		</div>
		<div class="space-y-5 px-6 py-5">
			<div class="grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-x-6">
				<div class="lg:pt-2.5">
					<span class="text-sm font-semibold text-foreground">Keep Alive</span>
					<p class="mt-0.5 text-xs text-muted-foreground">Periodically ping the server to prevent session timeout</p>
				</div>
				<div>
					<button
						type="button"
						class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
							{prefs.keepAlive ? 'bg-primary' : 'bg-muted'}"
						role="switch"
						aria-checked={prefs.keepAlive}
						onclick={() => prefs.keepAlive = !prefs.keepAlive}
					>
						<span
							class="pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform
								{prefs.keepAlive ? 'translate-x-5' : 'translate-x-0'}"
						></span>
					</button>
				</div>
			</div>
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
