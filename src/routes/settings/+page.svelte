<script lang="ts">
	import { prefs } from '$lib/stores/preferences.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import {
		Monitor, Moon, Sun, TreePine, List, Columns3, Globe, RotateCcw
	} from 'lucide-svelte';

	function handleLanguageChange(lang: string) {
		prefs.adminLanguage = lang;
		i18n.setLanguage(lang);
		toast.success(`Language changed to ${lang}`);
	}

	function resetPreferences() {
		if (!confirm('Reset all admin preferences to defaults?')) return;
		localStorage.removeItem('grav_admin_prefs');
		localStorage.removeItem('grav_admin_theme');
		toast.success('Preferences reset. Reload to apply.');
	}
</script>

<svelte:head>
	<title>Settings — Grav Admin</title>
</svelte:head>

<div class="space-y-6 p-5">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
		<p class="mt-0.5 text-[13px] text-muted-foreground">Configure your admin experience</p>
	</div>

	<!-- Appearance -->
	<div class="rounded-lg border border-border bg-card">
		<div class="border-b border-border px-5 py-3">
			<h2 class="text-sm font-semibold text-foreground">Appearance</h2>
			<p class="text-[12px] text-muted-foreground">Customize the look and feel of the admin</p>
		</div>
		<div class="divide-y divide-border">
			<!-- Color Mode -->
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Color Mode</div>
					<div class="text-[12px] text-muted-foreground">Choose between light and dark appearance</div>
				</div>
				<div class="inline-flex rounded-md border border-border shadow-sm">
					<button
						class="inline-flex h-8 items-center gap-1.5 rounded-l-md px-3 text-[12px] font-medium transition-colors
							{!theme.isDark ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
						onclick={() => theme.setColorMode('light')}
					>
						<Sun size={14} /> Light
					</button>
					<button
						class="inline-flex h-8 items-center gap-1.5 rounded-r-md px-3 text-[12px] font-medium transition-colors
							{theme.isDark ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
						onclick={() => theme.setColorMode('dark')}
					>
						<Moon size={14} /> Dark
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Pages -->
	<div class="rounded-lg border border-border bg-card">
		<div class="border-b border-border px-5 py-3">
			<h2 class="text-sm font-semibold text-foreground">Pages</h2>
			<p class="text-[12px] text-muted-foreground">Default settings for the page browser</p>
		</div>
		<div class="divide-y divide-border">
			<!-- Default View Mode -->
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Default View</div>
					<div class="text-[12px] text-muted-foreground">How pages are displayed by default</div>
				</div>
				<div class="inline-flex rounded-md border border-border shadow-sm">
					<button
						class="inline-flex h-8 items-center gap-1.5 rounded-l-md px-3 text-[12px] font-medium transition-colors
							{prefs.pagesViewMode === 'tree' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
						onclick={() => prefs.pagesViewMode = 'tree'}
					>
						<TreePine size={14} /> Tree
					</button>
					<button
						class="inline-flex h-8 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors
							{prefs.pagesViewMode === 'list' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
						onclick={() => prefs.pagesViewMode = 'list'}
					>
						<List size={14} /> List
					</button>
					<button
						class="inline-flex h-8 items-center gap-1.5 rounded-r-md px-3 text-[12px] font-medium transition-colors
							{prefs.pagesViewMode === 'miller' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}"
						onclick={() => prefs.pagesViewMode = 'miller'}
					>
						<Columns3 size={14} /> Columns
					</button>
				</div>
			</div>

			<!-- Items per Page -->
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Items per Page</div>
					<div class="text-[12px] text-muted-foreground">Number of pages shown in list view</div>
				</div>
				<select
					class="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
	<div class="rounded-lg border border-border bg-card">
		<div class="border-b border-border px-5 py-3">
			<h2 class="text-sm font-semibold text-foreground">Language</h2>
			<p class="text-[12px] text-muted-foreground">Admin interface language</p>
		</div>
		<div class="divide-y divide-border">
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Admin Language</div>
					<div class="text-[12px] text-muted-foreground">Language for labels, menus, and messages ({i18n.count} strings loaded)</div>
				</div>
				<select
					class="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
	<div class="rounded-lg border border-border bg-card">
		<div class="border-b border-border px-5 py-3">
			<h2 class="text-sm font-semibold text-foreground">Session</h2>
			<p class="text-[12px] text-muted-foreground">Keep your session active while working</p>
		</div>
		<div class="divide-y divide-border">
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Keep Alive</div>
					<div class="text-[12px] text-muted-foreground">Periodically ping the server to prevent session timeout</div>
				</div>
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

	<!-- Connection -->
	<div class="rounded-lg border border-border bg-card">
		<div class="border-b border-border px-5 py-3">
			<h2 class="text-sm font-semibold text-foreground">Connection</h2>
			<p class="text-[12px] text-muted-foreground">Server connection details</p>
		</div>
		<div class="divide-y divide-border">
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Server URL</div>
					<div class="text-[12px] text-muted-foreground">{auth.serverUrl}</div>
				</div>
				<span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
					<Globe size={11} class="mr-1" />
					{auth.environment || 'default'}
				</span>
			</div>
			<div class="flex items-center justify-between px-5 py-4">
				<div>
					<div class="text-sm font-medium text-foreground">Authenticated As</div>
					<div class="text-[12px] text-muted-foreground">{auth.username}</div>
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
