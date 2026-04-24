<script lang="ts">
	import type { Peer } from '$lib/sync/SyncProvider';

	interface Props {
		peers: Peer[];
		clientId: string;
		max?: number;
	}

	let { peers, clientId, max = 5 }: Props = $props();

	// Stable color per clientId so people keep their badge color on reconnect.
	function colorFor(id: string): string {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
		return `hsl(${((h % 360) + 360) % 360} 65% 45%)`;
	}

	function initials(p: Peer): string {
		const label = p.user?.trim() || p.clientId;
		if (!label) return '?';
		const parts = label.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		return label.slice(0, 2).toUpperCase();
	}

	// Others only; self is implied.
	let others = $derived(peers.filter((p) => p.clientId !== clientId));
	let visible = $derived(others.slice(0, max));
	let overflow = $derived(Math.max(0, others.length - max));
</script>

{#if others.length > 0}
	<div class="flex items-center gap-1.5" aria-label={`${others.length} collaborator${others.length === 1 ? '' : 's'}`}>
		<div class="flex -space-x-2">
			{#each visible as p (p.clientId)}
				<span
					class="relative inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold text-white ring-0"
					style="background-color: {colorFor(p.clientId)}"
					title={p.user ?? p.clientId}
				>
					{initials(p)}
				</span>
			{/each}
			{#if overflow > 0}
				<span
					class="relative inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold text-foreground"
					title={`${overflow} more`}
				>
					+{overflow}
				</span>
			{/if}
		</div>
	</div>
{/if}
