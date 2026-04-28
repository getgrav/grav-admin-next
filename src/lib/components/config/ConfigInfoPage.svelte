<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { api } from '$lib/api/client';
	import { Button } from '$lib/components/ui/button';
	import { ChevronDown, ChevronRight, Download } from 'lucide-svelte';

	interface Props {
		/** Optional substring filter — matches against section/key/value text. */
		filter?: string;
	}
	let { filter = '' }: Props = $props();

	interface SystemInfoData {
		grav_version: string;
		php_version: string;
		php_extensions: string[];
		server_software: string;
		environment: string;
		plugins: Array<{ name: string; version: string; enabled: boolean }>;
		themes: Array<{ name: string; version: string; active: boolean }>;
		php_config?: Record<string, Record<string, string>>;
	}

	let info = $state<SystemInfoData | null>(null);
	let loading = $state(true);
	let error = $state('');
	let expandedSections = $state<Set<string>>(new Set());

	function toggleSection(name: string) {
		const next = new Set(expandedSections);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		expandedSections = next;
	}

	function expandAll() {
		if (!info?.php_config) return;
		expandedSections = new Set(Object.keys(info.php_config));
	}

	function collapseAll() {
		expandedSections = new Set();
	}

	const allExpanded = $derived(
		info?.php_config ? expandedSections.size === Object.keys(info.php_config).length : false
	);

	// ─── Filter helpers ──────────────────────────────────────────────
	const q = $derived(filter.trim().toLowerCase());
	const isFiltering = $derived(q.length > 0);

	function matches(text: string | number | boolean | undefined | null): boolean {
		if (text === undefined || text === null) return false;
		return String(text).toLowerCase().includes(q);
	}

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	function highlight(text: string): string {
		const safe = escapeHtml(text);
		if (!isFiltering) return safe;
		const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return safe.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="rounded-sm bg-yellow-400/40 text-inherit">$1</mark>');
	}

	// PHP config: filter rows + auto-expand any section that has a match
	// (or whose section name itself matches). Sections with zero matches
	// are hidden. Reactive — clearing the filter restores user-driven
	// expansion state.
	const filteredPhpConfig = $derived.by(() => {
		if (!info?.php_config) return null;
		if (!isFiltering) return Object.entries(info.php_config).map(([s, v]) => [s, Object.entries(v)] as const);
		const out: Array<readonly [string, Array<[string, string]>]> = [];
		for (const [section, values] of Object.entries(info.php_config)) {
			const sectionHit = matches(section);
			const rowHits = Object.entries(values).filter(([k, v]) => matches(k) || matches(v));
			if (sectionHit) {
				out.push([section, Object.entries(values)]);
			} else if (rowHits.length > 0) {
				out.push([section, rowHits]);
			}
		}
		return out;
	});

	const phpConfigSectionsToShow = $derived(
		isFiltering
			? new Set((filteredPhpConfig ?? []).map(([s]) => s))
			: null
	);

	// Server info rows
	type ServerRow = { labelKey: string; labelText: string; value: string };
	const serverRows = $derived.by((): ServerRow[] => {
		if (!info) return [];
		return [
			{ labelKey: 'ADMIN_NEXT.CONFIG_INFO_PAGE.GRAV_VERSION', labelText: i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.GRAV_VERSION'), value: info.grav_version },
			{ labelKey: 'ADMIN_NEXT.CONFIG_INFO_PAGE.PHP_VERSION', labelText: i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.PHP_VERSION'), value: info.php_version },
			{ labelKey: 'ADMIN_NEXT.CONFIG_INFO_PAGE.SERVER_SOFTWARE', labelText: i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.SERVER_SOFTWARE'), value: info.server_software },
			{ labelKey: 'ADMIN_NEXT.CONFIG_INFO_PAGE.ENVIRONMENT', labelText: i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.ENVIRONMENT'), value: info.environment },
		];
	});
	const visibleServerRows = $derived(
		isFiltering ? serverRows.filter(r => matches(r.labelText) || matches(r.value)) : serverRows
	);
	const visibleExtensions = $derived(
		!info ? [] : (isFiltering ? [...info.php_extensions].filter(matches) : [...info.php_extensions]).sort()
	);
	const visiblePlugins = $derived(
		!info ? [] : (isFiltering ? info.plugins.filter(p => matches(p.name) || matches(p.version)) : info.plugins)
	);
	const visibleThemes = $derived(
		!info ? [] : (isFiltering ? info.themes.filter(t => matches(t.name) || matches(t.version)) : info.themes)
	);

	function exportYaml() {
		if (!info) return;

		const lines: string[] = [];
		lines.push('# System Information');
		lines.push(`# Exported: ${new Date().toISOString()}`);
		lines.push('');

		lines.push('server:');
		lines.push(`  grav_version: "${info.grav_version}"`);
		lines.push(`  php_version: "${info.php_version}"`);
		lines.push(`  server_software: "${info.server_software}"`);
		lines.push(`  environment: "${info.environment}"`);
		lines.push('');

		if (info.php_config) {
			lines.push('php_config:');
			for (const [section, values] of Object.entries(info.php_config)) {
				const sectionKey = section.toLowerCase().replace(/[^a-z0-9]+/g, '_');
				lines.push(`  ${sectionKey}:`);
				for (const [key, value] of Object.entries(values)) {
					// Escape values that could be misinterpreted as YAML
					const safeVal = value.includes(':') || value.includes('#') || value === '' || value === '(none)'
						? `"${value}"`
						: `"${value}"`;
					lines.push(`    ${key}: ${safeVal}`);
				}
			}
			lines.push('');
		}

		lines.push('php_extensions:');
		for (const ext of [...info.php_extensions].sort()) {
			lines.push(`  - ${ext}`);
		}
		lines.push('');

		lines.push('plugins:');
		for (const p of info.plugins) {
			lines.push(`  - name: "${p.name}"`);
			lines.push(`    version: "${p.version}"`);
			lines.push(`    enabled: ${p.enabled}`);
		}
		lines.push('');

		lines.push('themes:');
		for (const t of info.themes) {
			lines.push(`  - name: "${t.name}"`);
			lines.push(`    version: "${t.version}"`);
			lines.push(`    active: ${t.active}`);
		}

		const blob = new Blob([lines.join('\n')], { type: 'text/yaml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `grav-system-info-${new Date().toISOString().slice(0, 10)}.yaml`;
		a.click();
		URL.revokeObjectURL(url);
	}

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
	<div class="py-20 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.LOADING_SYSTEM_INFORMATION')}</div>
{:else if error}
	<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
		{error}
	</div>
{:else if info}
	<!-- Export button -->
	<div class="flex justify-end">
		<Button variant="outline" size="sm" onclick={exportYaml}>
			<Download size={14} />
			{i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.EXPORT_YAML')}
		</Button>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<!-- Server Info -->
		{#if !isFiltering || visibleServerRows.length > 0}
			<div class="rounded-lg border border-border bg-card">
				<div class="border-b border-border px-5 py-3">
					<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.SERVER')}</h3>
				</div>
				<dl class="divide-y divide-border">
					{#each visibleServerRows as row (row.labelKey)}
						<div class="flex justify-between px-5 py-2.5">
							<dt class="text-sm text-muted-foreground">{@html highlight(row.labelText)}</dt>
							<dd class="max-w-[200px] truncate text-sm font-medium text-foreground" title={row.value}>{@html highlight(row.value)}</dd>
						</div>
					{/each}
				</dl>
			</div>
		{/if}

		<!-- PHP Extensions -->
		{#if !isFiltering || visibleExtensions.length > 0}
			<div class="rounded-lg border border-border bg-card">
				<div class="border-b border-border px-5 py-3">
					<h3 class="text-sm font-semibold text-foreground">
						{i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.PHP_EXTENSIONS')}
						<span class="ml-1 text-xs font-normal text-muted-foreground">({visibleExtensions.length}{isFiltering ? ` / ${info.php_extensions.length}` : ''})</span>
					</h3>
				</div>
				<div class="max-h-64 overflow-y-auto px-5 py-3">
					<div class="flex flex-wrap gap-1.5">
						{#each visibleExtensions as ext}
							<span class="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-foreground">{@html highlight(ext)}</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Plugins -->
		{#if !isFiltering || visiblePlugins.length > 0}
			<div class="rounded-lg border border-border bg-card">
				<div class="border-b border-border px-5 py-3">
					<h3 class="text-sm font-semibold text-foreground">
						{i18n.t('ADMIN_NEXT.NAV.PLUGINS')}
						<span class="ml-1 text-xs font-normal text-muted-foreground">({visiblePlugins.length}{isFiltering ? ` / ${info.plugins.length}` : ''})</span>
					</h3>
				</div>
				<div class="max-h-72 overflow-y-auto divide-y divide-border">
					{#each visiblePlugins as plugin (plugin.name)}
						<div class="flex items-center justify-between px-5 py-2">
							<div class="flex items-center gap-2">
								<span class="h-1.5 w-1.5 shrink-0 rounded-full {plugin.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}"></span>
								<span class="text-sm text-foreground">{@html highlight(plugin.name)}</span>
							</div>
							<span class="text-xs text-muted-foreground">{@html highlight(plugin.version)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Themes -->
		{#if !isFiltering || visibleThemes.length > 0}
			<div class="rounded-lg border border-border bg-card">
				<div class="border-b border-border px-5 py-3">
					<h3 class="text-sm font-semibold text-foreground">
						{i18n.t('ADMIN_NEXT.NAV.THEMES')}
						<span class="ml-1 text-xs font-normal text-muted-foreground">({visibleThemes.length}{isFiltering ? ` / ${info.themes.length}` : ''})</span>
					</h3>
				</div>
				<div class="max-h-72 overflow-y-auto divide-y divide-border">
					{#each visibleThemes as theme (theme.name)}
						<div class="flex items-center justify-between px-5 py-2">
							<div class="flex items-center gap-2">
								<span class="h-1.5 w-1.5 shrink-0 rounded-full {theme.active ? 'bg-primary' : 'bg-muted-foreground/30'}"></span>
								<span class="text-sm text-foreground">{@html highlight(theme.name)}</span>
							</div>
							<span class="text-xs text-muted-foreground">{@html highlight(theme.version)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- PHP Configuration -->
	{#if info.php_config && filteredPhpConfig && (!isFiltering || filteredPhpConfig.length > 0)}
		<div class="mt-2">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.CONFIG_INFO_PAGE.PHP_CONFIGURATION')}</h3>
				{#if !isFiltering}
					<button
						class="text-xs text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => allExpanded ? collapseAll() : expandAll()}
					>
						{allExpanded ? 'Collapse all' : 'Expand all'}
					</button>
				{/if}
			</div>
			<div class="space-y-2">
				{#each filteredPhpConfig as [section, rows] (section)}
					{@const isExpanded = isFiltering ? true : expandedSections.has(section)}
					<div class="rounded-lg border border-border bg-card">
						<button
							class="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-accent/50"
							onclick={() => isFiltering || toggleSection(section)}
							disabled={isFiltering}
						>
							{#if isExpanded}
								<ChevronDown size={14} class="shrink-0 text-muted-foreground" />
							{:else}
								<ChevronRight size={14} class="shrink-0 text-muted-foreground" />
							{/if}
							<span class="text-sm font-semibold text-foreground">{@html highlight(section)}</span>
							<span class="text-xs text-muted-foreground">({rows.length}{isFiltering && rows.length !== Object.keys(info.php_config[section] ?? {}).length ? ` / ${Object.keys(info.php_config[section] ?? {}).length}` : ''})</span>
						</button>
						{#if isExpanded}
							<dl class="divide-y divide-border border-t border-border">
								{#each rows as [key, value] (key)}
									<div class="flex items-start justify-between gap-4 px-5 py-2.5">
										<dt class="shrink-0 font-mono text-xs text-muted-foreground">{@html highlight(key)}</dt>
										<dd class="min-w-0 break-all text-right font-mono text-xs font-medium text-foreground">{@html highlight(value)}</dd>
									</div>
								{/each}
							</dl>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if isFiltering && (filteredPhpConfig?.length ?? 0) === 0 && visibleServerRows.length === 0 && visibleExtensions.length === 0 && visiblePlugins.length === 0 && visibleThemes.length === 0}
		<div class="py-12 text-center text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.CONFIG.NO_MATCHES_FOUND')}
		</div>
	{/if}
{/if}
