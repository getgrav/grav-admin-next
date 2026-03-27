<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
	}

	let { field }: Props = $props();
	const translateLabel = i18n.tMaybe;
</script>

{#if field.title}
	<div class="mt-2 border-b border-border pb-1">
		<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			{translateLabel(field.title)}
		</h4>
	</div>
{:else if field.underline !== false}
	<hr class="border-border" />
{/if}
