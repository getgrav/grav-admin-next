<script lang="ts">
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

	let activeTab = $state('backups');
</script>

<svelte:head>
	<title>Tools — Grav Admin</title>
</svelte:head>

<div class="space-y-4 p-5">
	<h1 class="text-lg font-semibold text-foreground">Tools</h1>

	<Tabs items={tabs} active={activeTab} onchange={(id) => { activeTab = id; }} />

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
