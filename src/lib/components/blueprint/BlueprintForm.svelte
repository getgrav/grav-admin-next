<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from './FieldRenderer.svelte';

	interface Props {
		fields: BlueprintField[];
		data: Record<string, unknown>;
		onchange?: (path: string, value: unknown) => void;
		oncommit?: (path: string, value: unknown, oldValue?: unknown) => void;
		filter?: string;
	}

	let { fields, data, onchange, oncommit, filter = '' }: Props = $props();

	/**
	 * Normalize blueprint fields: adopt orphan siblings into bare sections.
	 *
	 * In Grav blueprints, a section with no `fields` followed by sibling
	 * fields is visually equivalent to a section containing those fields.
	 * This function collects orphan fields into the preceding bare section,
	 * stopping at the next section/fieldset boundary. Applied recursively.
	 */
	function normalizeFields(input: BlueprintField[]): BlueprintField[] {
		const sectionTypes = new Set(['section', 'fieldset']);
		const result: BlueprintField[] = [];

		let i = 0;
		while (i < input.length) {
			const field = input[i];

			// If this is a bare section (no fields), collect following siblings
			if (sectionTypes.has(field.type) && !field.fields?.length) {
				const adopted: BlueprintField[] = [];
				let j = i + 1;
				while (j < input.length && !sectionTypes.has(input[j].type)) {
					adopted.push(input[j]);
					j++;
				}
				if (adopted.length > 0) {
					result.push({ ...field, fields: normalizeFields(adopted) });
				} else {
					result.push(field);
				}
				i = j;
			} else {
				// Recurse into any field that has children
				if (field.fields?.length) {
					result.push({ ...field, fields: normalizeFields(field.fields) });
				} else {
					result.push(field);
				}
				i++;
			}
		}

		return result;
	}

	const normalizedFields = $derived(normalizeFields(fields));

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

	function handleCommit(path: string, value: unknown, oldValue?: unknown) {
		oncommit?.(path, value, oldValue);
	}
</script>

<div class="space-y-4">
	{#each normalizedFields as field (field.name)}
		<FieldRenderer
			{field}
			value={getValue(field.name)}
			onchange={(val) => handleChange(field.name, val)}
			oncommit={oncommit ? (val: unknown, old?: unknown) => handleCommit(field.name, val, old) : undefined}
			{getValue}
			onFieldChange={handleChange}
			onFieldCommit={oncommit ? handleCommit : undefined}
			{filter}
		/>
	{/each}
</div>
