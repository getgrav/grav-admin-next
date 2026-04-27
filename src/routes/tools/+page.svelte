<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
	import BackupsTab from '$lib/components/tools/BackupsTab.svelte';
	import SchedulerTab from '$lib/components/tools/SchedulerTab.svelte';
	import LogsTab from '$lib/components/tools/LogsTab.svelte';
	import ReportsTab from '$lib/components/tools/ReportsTab.svelte';
	import DirectInstallTab from '$lib/components/tools/DirectInstallTab.svelte';

	const tabs = [
		{ id: 'backups', label: 'Backups' },
		{ id: 'scheduler', label: 'Scheduler' },
		{ id: 'logs', label: 'Logs' },
		{ id: 'reports', label: 'Reports' },
		{ id: 'direct-install', label: 'Direct Install' },
	];

	const validIds = new Set(tabs.map(t => t.id));

	// Read active tab from URL hash, default to 'backups'
	// Supports nested hashes like #scheduler--jobs_tab (first segment is the tools tab)
	let activeTab = $derived((() => {
		const hash = page.url.hash.replace('#', '').split('--')[0];
		return validIds.has(hash) ? hash : 'backups';
	})());

	function setTab(id: string) {
		goto(`#${id}`, { replaceState: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>{i18n.t('ADMIN_NEXT.TOOLS.TOOLS_GRAV_ADMIN')}</title>
</svelte:head>

<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="space-y-3 px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Tools</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.BACKUPS_SCHEDULER_LOGS_AND_DIAGNOSTICS')}</p>
						{/if}
					</div>
				</div>

				<Tabs items={tabs} active={activeTab} onchange={setTab} />
			</div>
		{/snippet}
	</StickyHeader>

	<div class="px-6 pb-6 pt-4">
		{#if activeTab === 'backups'}
			<BackupsTab />
		{:else if activeTab === 'scheduler'}
			<SchedulerTab />
		{:else if activeTab === 'logs'}
			<LogsTab />
		{:else if activeTab === 'reports'}
			<ReportsTab />
		{:else if activeTab === 'direct-install'}
			<DirectInstallTab />
		{/if}
	</div>
</div>
