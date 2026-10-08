import type { BlueprintField } from '$lib/api/endpoints/blueprints';

/**
 * Resolve HTML numeric and length constraints from a blueprint field.
 *
 * Grav accepts a constraint in two places: as a top-level field property
 * (`min: 1`) and nested under the field's `validate:` block
 * (`validate: { min: 1 }`). The `validate:` form is canonical — it is what
 * core's `Validation::typeNumber()` enforces on save, what the classic admin's
 * range/number/datetime templates rendered from, and what Grav's own
 * `system.yaml` uses for `images.default_image_quality`. Admin-next only ever
 * read the top-level form, so a blueprint written the documented way fell
 * through to the built-in fallback (getgrav/grav-plugin-admin2#155).
 *
 * Accept both, top-level first, which is the precedence grav-plugin-form's
 * text/textarea templates already use (`field.minlength | default(field.validate.min)`).
 */

/** Coerce a blueprint value to a finite number, or undefined if it isn't one. */
export function toNumber(value: unknown): number | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	const num = Number(value);
	return Number.isFinite(num) ? num : undefined;
}

/** min / max for a numeric input (number, range). Step has its own resolver below. */
export function numericConstraint(field: BlueprintField, key: 'min' | 'max'): number | undefined {
	return toNumber(field[key]) ?? toNumber(field.validate?.[key]);
}

/**
 * step for a number, range or date-like input. Besides a number, HTML takes
 * `step="any"`, which accepts any value, and blueprints write it as
 * `validate: { step: any }` for decimals such as a latitude; the classic
 * admin passes it to the input as written. Read as a number it was dropped,
 * so the browser fell back to a step of 1 and marked every decimal invalid.
 */
export function stepConstraint(field: BlueprintField): number | 'any' | undefined {
	for (const raw of [field.step, field.validate?.step]) {
		if (typeof raw === 'string' && raw.trim().toLowerCase() === 'any') return 'any';
		const num = toNumber(raw);
		if (num !== undefined) return num;
	}
	return undefined;
}

/**
 * minlength / maxlength for a text input. On string fields Grav's
 * `validate.min` and `validate.max` are character counts, so they map onto the
 * length attributes rather than min/max.
 */
export function lengthConstraint(
	field: BlueprintField,
	key: 'minlength' | 'maxlength'
): number | undefined {
	const nested = key === 'minlength' ? field.validate?.min : field.validate?.max;
	return toNumber(field[key]) ?? toNumber(nested);
}

/** Keep a slider value inside its resolved range so the readout can't lie. */
export function clampToRange(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
