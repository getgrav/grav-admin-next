<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
	}

	let { field, getValue, onFieldChange }: Props = $props();

	/**
	 * Evaluate a simple condition string against config/form values.
	 *
	 * Supports patterns like:
	 *   "config.system.accounts.avatar == 'multiavatar'"
	 *   "config.plugins.admin.twofa_enabled"
	 *   "header.some_field"
	 *
	 * For full Grav compatibility, the condition would need server-side
	 * evaluation. For now we handle the common patterns client-side:
	 * - Boolean truthy check (no operator)
	 * - == / != comparison
	 */
	const visible = $derived.by(() => {
		const condition = (field as unknown as Record<string, unknown>).condition as string | undefined;
		if (!condition) return true;

		// Try to parse "left == right" or "left != right"
		const eqMatch = condition.match(/^(.+?)\s*(==|!=)\s*['"]?(.+?)['"]?\s*$/);
		if (eqMatch) {
			const [, left, op, right] = eqMatch;
			const leftVal = resolveValue(left.trim());
			const leftStr = String(leftVal ?? '');
			const rightStr = right.trim();
			return op === '==' ? leftStr === rightStr : leftStr !== rightStr;
		}

		// Simple truthy check
		const val = resolveValue(condition.trim());
		return !!val;
	});

	function resolveValue(path: string): unknown {
		// config.* paths → read from getValue which has access to form data
		// In a page context, header.* maps to form data
		// For config.*, we'd need the config store — for now, try getValue
		return getValue(path);
	}
</script>

{#if visible && field.fields}
	{#each field.fields as childField (childField.name)}
		<FieldRenderer
			field={childField}
			value={getValue(childField.name)}
			onchange={(val) => onFieldChange(childField.name, val)}
			{getValue}
			{onFieldChange}
		/>
	{/each}
{/if}
