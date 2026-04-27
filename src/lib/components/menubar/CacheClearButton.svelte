<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { api } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { Trash2, ChevronDown, Loader2 } from 'lucide-svelte';

	let open = $state(false);
	let clearing = $state(false);

	const scopes = [
		{ value: 'standard', label: 'Standard Cache' },
		{ value: 'all', label: 'All Caches' },
		{ value: 'assets', label: 'Assets Only' },
		{ value: 'images', label: 'Images Only' },
		{ value: 'tmp', label: 'Tmp Only' },
	];

	async function clearCache(scope: string) {
		open = false;
		clearing = true;
		try {
			await api.delete(`/cache?scope=${scope}`);
			toast.success(`Cache cleared (${scope})`);
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.CACHE_CLEAR_BUTTON.FAILED_TO_CLEAR_CACHE'));
		} finally {
			clearing = false;
		}
	}

	function handleBackdrop() {
		open = false;
	}
</script>

<div class="relative">
	<div class="flex items-center">
		<!-- Main button -->
		<button
			class="flex h-7 items-center gap-1 rounded-l-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground
				{!open ? 'rounded-r-md' : ''}"
			onclick={() => clearing ? null : clearCache('standard')}
			disabled={clearing}
			title={i18n.t('ADMIN_NEXT.CACHE_CLEAR_BUTTON.CLEAR_CACHE')}
		>
			{#if clearing}
				<Loader2 size={14} class="animate-spin" />
			{:else}
				<Trash2 size={14} />
			{/if}
		</button>
		<!-- Dropdown toggle -->
		<button
			class="flex h-7 items-center rounded-r-md px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
			onclick={() => open = !open}
			title={i18n.t('ADMIN_NEXT.CACHE_CLEAR_BUTTON.CACHE_OPTIONS')}
		>
			<ChevronDown size={12} />
		</button>
	</div>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-40" onclick={handleBackdrop}></div>
		<div class="absolute right-0 top-full z-50 mt-1.5 min-w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
			{#each scopes as scope}
				<button
					class="flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent"
					onclick={() => clearCache(scope.value)}
				>
					{scope.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
