<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from './FieldRenderer.svelte';

	interface Props {
		fields: BlueprintField[];
		data: Record<string, unknown>;
		onchange?: (path: string, value: unknown) => void;
	}

	let { fields, data, onchange }: Props = $props();

	function getValue(path: string): unknown {
		const parts = path.split('.');
		let current: unknown = data;
		for (const part of parts) {
			if (current === null || current === undefined || typeof current !== 'object') return undefined;
			current = (current as Record<string, unknown>)[part];
		}
		return current;
	}

	function handleChange(path: string, value: unknown) {
		// Update nested path in data
		const parts = path.split('.');
		const newData = { ...data };
		let current: Record<string, unknown> = newData;

		for (let i = 0; i < parts.length - 1; i++) {
			if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
				current[parts[i]] = {};
			}
			current[parts[i]] = { ...(current[parts[i]] as Record<string, unknown>) };
			current = current[parts[i]] as Record<string, unknown>;
		}

		current[parts[parts.length - 1]] = value;

		// Notify parent
		onchange?.(path, value);
	}
</script>

<div class="space-y-4">
	{#each fields as field (field.name)}
		<FieldRenderer
			{field}
			value={getValue(field.name)}
			onchange={(val) => handleChange(field.name, val)}
			{getValue}
			onFieldChange={handleChange}
		/>
	{/each}
</div>
