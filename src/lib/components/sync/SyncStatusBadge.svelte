<script lang="ts">
	import type { SyncStatus } from '$lib/sync/SyncProvider';
	import { CloudOff, Cloud, CloudUpload, AlertTriangle, Loader2 } from 'lucide-svelte';

	interface Props {
		status: SyncStatus;
		detail?: string;
		peerCount?: number;
	}

	let { status, detail, peerCount = 0 }: Props = $props();

	let label = $derived.by(() => {
		switch (status) {
			case 'connected':
				return peerCount > 0 ? `Live (${peerCount + 1} editing)` : 'Live';
			case 'connecting':
				return 'Connecting…';
			case 'offline':
				return 'Offline';
			case 'error':
				return 'Error';
			case 'idle':
			default:
				return 'Idle';
		}
	});

	let tint = $derived.by(() => {
		switch (status) {
			case 'connected':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'connecting':
				return 'text-amber-600 dark:text-amber-400';
			case 'offline':
				return 'text-muted-foreground';
			case 'error':
				return 'text-red-600 dark:text-red-400';
			case 'idle':
			default:
				return 'text-muted-foreground';
		}
	});
</script>

<span
	class="inline-flex items-center gap-1.5 text-xs font-medium {tint}"
	title={detail ?? label}
>
	{#if status === 'connecting'}
		<Loader2 class="h-3.5 w-3.5 animate-spin" />
	{:else if status === 'connected'}
		{#if peerCount > 0}
			<CloudUpload class="h-3.5 w-3.5" />
		{:else}
			<Cloud class="h-3.5 w-3.5" />
		{/if}
	{:else if status === 'offline'}
		<CloudOff class="h-3.5 w-3.5" />
	{:else if status === 'error'}
		<AlertTriangle class="h-3.5 w-3.5" />
	{:else}
		<Cloud class="h-3.5 w-3.5 opacity-50" />
	{/if}
	<span>{label}</span>
</span>
