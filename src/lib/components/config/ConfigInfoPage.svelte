<script lang="ts">
	import { api } from '$lib/api/client';

	interface SystemInfoData {
		grav_version: string;
		php_version: string;
		php_extensions: string[];
		server_software: string;
		environment: string;
		plugins: Array<{ name: string; version: string; enabled: boolean }>;
		themes: Array<{ name: string; version: string; active: boolean }>;
	}

	let info = $state<SystemInfoData | null>(null);
	let loading = $state(true);
	let error = $state('');

	async function loadInfo() {
		loading = true;
		error = '';
		try {
			info = await api.get<SystemInfoData>('/system/info');
		} catch {
			error = 'Failed to load system information.';
		} finally {
			loading = false;
		}
	}

	$effect(() => { loadInfo(); });
</script>

{#if loading}
	<div class="py-20 text-center text-sm text-muted-foreground">Loading system information...</div>
{:else if error}
	<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
		{error}
	</div>
{:else if info}
	<div class="grid gap-4 md:grid-cols-2">
		<!-- Server Info -->
		<div class="rounded-lg border border-border bg-card">
			<div class="border-b border-border px-5 py-3">
				<h3 class="text-sm font-semibold text-foreground">Server</h3>
			</div>
			<dl class="divide-y divide-border">
				<div class="flex justify-between px-5 py-2.5">
					<dt class="text-sm text-muted-foreground">Grav Version</dt>
					<dd class="text-sm font-medium text-foreground">{info.grav_version}</dd>
				</div>
				<div class="flex justify-between px-5 py-2.5">
					<dt class="text-sm text-muted-foreground">PHP Version</dt>
					<dd class="text-sm font-medium text-foreground">{info.php_version}</dd>
				</div>
				<div class="flex justify-between px-5 py-2.5">
					<dt class="text-sm text-muted-foreground">Server Software</dt>
					<dd class="max-w-[200px] truncate text-sm font-medium text-foreground" title={info.server_software}>{info.server_software}</dd>
				</div>
				<div class="flex justify-between px-5 py-2.5">
					<dt class="text-sm text-muted-foreground">Environment</dt>
					<dd class="text-sm font-medium text-foreground">{info.environment}</dd>
				</div>
			</dl>
		</div>

		<!-- PHP Extensions -->
		<div class="rounded-lg border border-border bg-card">
			<div class="border-b border-border px-5 py-3">
				<h3 class="text-sm font-semibold text-foreground">
					PHP Extensions
					<span class="ml-1 text-xs font-normal text-muted-foreground">({info.php_extensions.length})</span>
				</h3>
			</div>
			<div class="max-h-64 overflow-y-auto px-5 py-3">
				<div class="flex flex-wrap gap-1.5">
					{#each [...info.php_extensions].sort() as ext}
						<span class="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground">{ext}</span>
					{/each}
				</div>
			</div>
		</div>

		<!-- Plugins -->
		<div class="rounded-lg border border-border bg-card">
			<div class="border-b border-border px-5 py-3">
				<h3 class="text-sm font-semibold text-foreground">
					Plugins
					<span class="ml-1 text-xs font-normal text-muted-foreground">({info.plugins.length})</span>
				</h3>
			</div>
			<div class="max-h-72 overflow-y-auto divide-y divide-border">
				{#each info.plugins as plugin}
					<div class="flex items-center justify-between px-5 py-2">
						<div class="flex items-center gap-2">
							<span class="h-1.5 w-1.5 shrink-0 rounded-full {plugin.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}"></span>
							<span class="text-sm text-foreground">{plugin.name}</span>
						</div>
						<span class="text-xs text-muted-foreground">{plugin.version}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Themes -->
		<div class="rounded-lg border border-border bg-card">
			<div class="border-b border-border px-5 py-3">
				<h3 class="text-sm font-semibold text-foreground">
					Themes
					<span class="ml-1 text-xs font-normal text-muted-foreground">({info.themes.length})</span>
				</h3>
			</div>
			<div class="max-h-72 overflow-y-auto divide-y divide-border">
				{#each info.themes as theme}
					<div class="flex items-center justify-between px-5 py-2">
						<div class="flex items-center gap-2">
							<span class="h-1.5 w-1.5 shrink-0 rounded-full {theme.active ? 'bg-primary' : 'bg-muted-foreground/30'}"></span>
							<span class="text-sm text-foreground">{theme.name}</span>
						</div>
						<span class="text-xs text-muted-foreground">{theme.version}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
