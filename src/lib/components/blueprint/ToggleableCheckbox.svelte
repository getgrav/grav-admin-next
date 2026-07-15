<script lang="ts">
	// The on/off checkbox for a blueprint field marked `toggleable: true`.
	// Shared by SectionField (its direct children) and FieldRenderer (fields
	// nested inside columns/lists), so both draw an identical control.
	interface Props {
		toggled: boolean;
		onToggle: () => void;
	}

	let { toggled, onToggle }: Props = $props();
</script>

<button
	type="button"
	class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors
		{toggled ? 'border-primary bg-primary' : 'border-input bg-muted/50'}"
	aria-pressed={toggled}
	onclick={onToggle}
>
	{#if toggled}
		<svg class="h-3 w-3 text-white" viewBox="0 0 16 16" fill="currentColor"><path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"/></svg>
	{/if}
</button>
