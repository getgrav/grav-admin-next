<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
		translateLabel: (label: string | undefined) => string;
	}

	let { field, value, onchange, translateLabel }: Props = $props();

	let rawValue = $state(
		typeof value === 'string' ? value : JSON.stringify(value ?? field.default ?? '', null, 2)
	);

	function handleChange() {
		try {
			onchange(JSON.parse(rawValue));
		} catch {
			onchange(rawValue);
		}
	}
</script>

<label class="label">
	<span class="flex items-center gap-2 text-sm font-medium text-foreground">
		{translateLabel(field.label) || field.name}
		<span class="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{field.type}</span>
	</span>
	<textarea
		class="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
		rows={4}
		bind:value={rawValue}
		oninput={handleChange}
		style="resize: vertical;"
	></textarea>
</label>
