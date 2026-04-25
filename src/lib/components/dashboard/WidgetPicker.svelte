<script lang="ts">
	import { Plus, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { ResolvedWidget } from '$lib/dashboard/types';

	let {
		widgets,
		open = $bindable(false),
		onAdd,
	}: {
		widgets: ResolvedWidget[];
		open?: boolean;
		onAdd: (id: string) => void;
	} = $props();

	const hidden = $derived(widgets.filter(w => !w.visible));
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" role="dialog">
		<div class="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-base font-semibold text-foreground">{i18n.t('ADMIN_NEXT.DASHBOARD.PICKER_TITLE')}</h2>
					<p class="mt-0.5 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.DASHBOARD.PICKER_SUBTITLE')}</p>
				</div>
				<button type="button" class="rounded-md p-1 text-muted-foreground hover:bg-accent" onclick={() => open = false} aria-label={i18n.t('ADMIN_NEXT.CLOSE')}>
					<X size={16} />
				</button>
			</div>

			{#if hidden.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.DASHBOARD.PICKER_EMPTY')}</p>
			{:else}
				<div class="space-y-1">
					{#each hidden as w}
						<button
							type="button"
							class="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent"
							onclick={() => { onAdd(w.id); open = false; }}
						>
							<div class="min-w-0">
								<div class="text-[13px] font-medium text-foreground">{i18n.t(w.label)}</div>
								<div class="text-[11px] text-muted-foreground">{w.id}</div>
							</div>
							<Plus size={14} class="shrink-0 text-muted-foreground" />
						</button>
					{/each}
				</div>
			{/if}

			<div class="mt-5 flex justify-end">
				<Button variant="outline" size="sm" onclick={() => open = false}>Done</Button>
			</div>
		</div>
	</div>
{/if}
