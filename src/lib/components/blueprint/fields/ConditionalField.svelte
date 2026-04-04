<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
	}

	let { field, getValue, onFieldChange, onFieldCommit }: Props = $props();

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
		// config.* paths reference server-side Grav config which we can't
		// resolve client-side. Default to showing the fields rather than hiding.
		if (path.startsWith('config.')) {
			return true;
		}
		// Form data paths
		return getValue(path);
	}
</script>

{#if visible && field.fields}
	{#each field.fields as childField (childField.name)}
		<FieldRenderer
			field={childField}
			value={getValue(childField.name)}
			onchange={(val) => onFieldChange(childField.name, val)}
			oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
			{getValue}
			{onFieldChange}
			{onFieldCommit}
		/>
	{/each}
{/if}
