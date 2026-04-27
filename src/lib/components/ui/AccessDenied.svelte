<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ShieldX } from 'lucide-svelte';

	interface Props {
		/** Override the default message. */
		message?: string;
		/** Compact inline banner instead of full-page centered layout. */
		compact?: boolean;
	}

	let { message = "You don't have permission to access this resource.", compact = false }: Props = $props();
</script>

{#if compact}
	<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
		<ShieldX size={16} class="shrink-0" />
		{message}
	</div>
{:else}
	<div class="flex flex-col items-center justify-center py-20 text-center">
		<div class="mb-3 rounded-full bg-muted p-3">
			<ShieldX size={24} class="text-muted-foreground" />
		</div>
		<h2 class="text-base font-medium text-foreground">{i18n.t('ADMIN_NEXT.ACCESS_DENIED.ACCESS_DENIED')}</h2>
		<p class="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
	</div>
{/if}
