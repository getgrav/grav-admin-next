<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getReports } from '$lib/api/endpoints/tools';
	import type { SystemReports } from '$lib/api/endpoints/tools';
	import { Server, Cpu, HardDrive, Puzzle, Database } from 'lucide-svelte';

	let reports = $state<SystemReports | null>(null);
	let loading = $state(true);

	async function load() {
		loading = true;
		try {
			reports = await getReports();
		} catch {
			toast.error('Failed to load reports');
		} finally {
			loading = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (!bytes || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
	}

	function getDiskUsedPercent(): number {
		if (!reports?.disk) return 0;
		return Math.round(((reports.disk.total_space - reports.disk.free_space) / reports.disk.total_space) * 100);
	}

	onMount(load);
</script>

<div class="space-y-4">
	{#if loading}
		<div class="p-8 text-center text-sm text-muted-foreground">Loading reports...</div>
	{:else if reports}
		<div class="grid gap-4 lg:grid-cols-2">
			<!-- Grav & PHP Info -->
			<div class="rounded-lg border border-border bg-card">
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					<Server size={15} class="text-muted-foreground" />
					<h3 class="text-sm font-semibold text-foreground">System</h3>
				</div>
				<div class="divide-y divide-border text-sm">
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">Grav Version</span>
						<span class="font-medium text-foreground">{reports.grav.version}</span>
					</div>
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">PHP Version</span>
						<span class="font-medium text-foreground">{reports.php.version}</span>
					</div>
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">PHP SAPI</span>
						<span class="font-medium text-foreground">{reports.php.sapi}</span>
					</div>
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">Memory Limit</span>
						<span class="font-medium text-foreground">{reports.php.memory_limit}</span>
					</div>
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">Max Execution</span>
						<span class="font-medium text-foreground">{reports.php.max_execution_time}s</span>
					</div>
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">Max Upload</span>
						<span class="font-medium text-foreground">{reports.php.upload_max_filesize}</span>
					</div>
					<div class="flex justify-between px-4 py-2.5">
						<span class="text-muted-foreground">Max POST</span>
						<span class="font-medium text-foreground">{reports.php.post_max_size}</span>
					</div>
				</div>
			</div>

			<!-- Disk & Infrastructure -->
			<div class="space-y-4">
				<!-- Disk Usage -->
				<div class="rounded-lg border border-border bg-card">
					<div class="flex items-center gap-2 border-b border-border px-4 py-3">
						<HardDrive size={15} class="text-muted-foreground" />
						<h3 class="text-sm font-semibold text-foreground">Disk Usage</h3>
					</div>
					<div class="p-4">
						<div class="mb-2 flex justify-between text-sm">
							<span class="text-muted-foreground">
								{formatBytes(reports.disk.total_space - reports.disk.free_space)} used
							</span>
							<span class="font-medium text-foreground">{getDiskUsedPercent()}%</span>
						</div>
						<div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full transition-all {getDiskUsedPercent() > 90 ? 'bg-destructive' : getDiskUsedPercent() > 75 ? 'bg-amber-500' : 'bg-primary'}"
								style="width: {getDiskUsedPercent()}%"
							></div>
						</div>
						<p class="mt-2 text-xs text-muted-foreground">
							{formatBytes(reports.disk.free_space)} free of {formatBytes(reports.disk.total_space)}
						</p>
					</div>
				</div>

				<!-- Plugins -->
				<div class="rounded-lg border border-border bg-card">
					<div class="flex items-center gap-2 border-b border-border px-4 py-3">
						<Puzzle size={15} class="text-muted-foreground" />
						<h3 class="text-sm font-semibold text-foreground">Plugins</h3>
					</div>
					<div class="divide-y divide-border text-sm">
						<div class="flex justify-between px-4 py-2.5">
							<span class="text-muted-foreground">Total</span>
							<span class="font-medium text-foreground">{reports.plugins.total}</span>
						</div>
						<div class="flex justify-between px-4 py-2.5">
							<span class="text-muted-foreground">Enabled</span>
							<span class="font-medium text-emerald-500">{reports.plugins.enabled}</span>
						</div>
						<div class="flex justify-between px-4 py-2.5">
							<span class="text-muted-foreground">Disabled</span>
							<span class="font-medium text-muted-foreground">{reports.plugins.disabled}</span>
						</div>
					</div>
				</div>

				<!-- Cache -->
				<div class="rounded-lg border border-border bg-card">
					<div class="flex items-center gap-2 border-b border-border px-4 py-3">
						<Database size={15} class="text-muted-foreground" />
						<h3 class="text-sm font-semibold text-foreground">Cache</h3>
					</div>
					<div class="divide-y divide-border text-sm">
						<div class="flex justify-between px-4 py-2.5">
							<span class="text-muted-foreground">Status</span>
							<span class="font-medium {reports.cache.enabled ? 'text-emerald-500' : 'text-amber-500'}">
								{reports.cache.enabled ? 'Enabled' : 'Disabled'}
							</span>
						</div>
						<div class="flex justify-between px-4 py-2.5">
							<span class="text-muted-foreground">Driver</span>
							<span class="font-medium text-foreground">{reports.cache.driver}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- PHP Extensions -->
		<div class="rounded-lg border border-border bg-card">
			<div class="flex items-center gap-2 border-b border-border px-4 py-3">
				<Cpu size={15} class="text-muted-foreground" />
				<h3 class="text-sm font-semibold text-foreground">PHP Extensions ({reports.php.extensions.length})</h3>
			</div>
			<div class="flex flex-wrap gap-1.5 p-4">
				{#each [...reports.php.extensions].sort() as ext (ext)}
					<span class="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{ext}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
