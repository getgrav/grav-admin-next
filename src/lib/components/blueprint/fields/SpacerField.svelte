<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';

	interface Props {
		field: BlueprintField;
		translateLabel: (label: string | undefined) => string;
	}

	let { field, translateLabel }: Props = $props();
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
