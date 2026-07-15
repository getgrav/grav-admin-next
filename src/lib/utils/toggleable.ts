import type { BlueprintField } from '$lib/api/endpoints/blueprints';

/**
 * Shared state model for blueprint fields marked `toggleable: true`.
 *
 * A toggleable field carries an on/off checkbox next to its label; when OFF the
 * field's value is null (Grav then inherits/ignores it) and the control is
 * ghosted. The state is derived from the value rather than tracked separately,
 * so a remote collaboration update that nulls a field also collapses its UI.
 *
 * These take the value directly (rather than a getValue/name pair) so they work
 * anywhere a field is rendered — inside a section, inside columns, or inside a
 * list item, where the field's own onchange is the correct write channel.
 */

/** Is the toggle ON? Non-toggleable fields are always "on". */
export function isToggleOn(field: BlueprintField, value: unknown): boolean {
	if (!field.toggleable) return true;
	return value !== null && value !== undefined;
}

/**
 * The value a field takes when its toggleable wrapper is switched ON.
 * An explicit blueprint default always wins. For a toggle/switch we commit the
 * option the control visually highlights (its `highlight`, else the first
 * option) so the saved data matches what the user sees — otherwise an enabled
 * toggle persists '' which Grav reads as "off", e.g. dropping a page from
 * navigation (getgrav/grav#4153). Other field types keep the prior ''.
 */
export function resolveOnValue(field: BlueprintField): unknown {
	if (field.default !== undefined && field.default !== null) return field.default;

	if (field.type === 'toggle' || field.type === 'switch') {
		const isBool = field.validate?.type === 'bool';
		const optionValues = field.options?.length
			? field.options.map((o) => o.value)
			: (isBool ? ['1', '0'] : []);
		const chosen = field.highlight !== undefined && field.highlight !== null
			? String(field.highlight)
			: (optionValues.length ? String(optionValues[0]) : undefined);
		if (chosen !== undefined) {
			if (isBool) return chosen === '1' || chosen === 'true';
			const num = Number(chosen);
			return Number.isNaN(num) ? chosen : num;
		}
	}

	return '';
}

/**
 * When a toggleable field is OFF the real value is null — but we render its
 * blueprint default so the user can see what they'd be inheriting (matches
 * classic admin's "ghosted default" affordance). Once toggled on, the real
 * value (which toggleValue() initialised to the default) is authoritative.
 */
export function displayValue(field: BlueprintField, value: unknown, toggled: boolean): unknown {
	if (field.toggleable && !toggled) return resolveOnValue(field) ?? null;
	return value;
}

/**
 * The next value when the toggle is clicked. Toggling OFF sends null (rather
 * than undefined) so JSON.stringify preserves it and the server actually clears
 * the value; toggling ON adopts the field's effective on-value.
 */
export function toggleValue(field: BlueprintField, toggled: boolean): unknown {
	return toggled ? null : resolveOnValue(field);
}
