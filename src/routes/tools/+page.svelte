<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Tabs from '$lib/components/ui/Tabs.svelte';
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
	<title>Tools — Grav Admin</title>
</svelte:head>

<div class="space-y-4 p-6">
	<div class="flex min-h-8 items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">Tools</h1>
			<p class="mt-0.5 text-xs text-muted-foreground">Backups, scheduler, logs, and diagnostics</p>
		</div>
	</div>

	<Tabs items={tabs} active={activeTab} onchange={setTab} />

	<div class="pt-1">
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
