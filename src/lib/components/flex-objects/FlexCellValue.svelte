<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { summarizeCellValue } from '$lib/utils/flex-cell';

	interface Props {
		/** Raw value straight off the serialized Flex object. */
		value: unknown;
		/** Static value→label map for the column, if the blueprint declares one. */
		options?: Record<string, string>;
	}

	let { value, options }: Props = $props();

	const cell = $derived(
		summarizeCellValue(value, {
			options,
			yes: i18n.t('ADMIN_NEXT.YES'),
			no: i18n.t('ADMIN_NEXT.NO'),
		}),
	);
</script>

{#if cell.truncated}<span title={cell.full}>{cell.text}</span>{:else}{cell.text}{/if}
