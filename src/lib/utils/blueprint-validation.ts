import type { BlueprintField } from '$lib/api/endpoints/blueprints';
import { i18n } from '$lib/stores/i18n.svelte';
import { toast } from 'svelte-sonner';

/**
 * Client-side blueprint validation.
 *
 * Mirrors the `validate.required` rule that admin-classic enforced with the
 * browser's native "Please fill out this field" popup (getgrav/grav-plugin-admin2#30).
 * admin-next renders fields itself, so it has to gate the save explicitly: a
 * required field left empty blocks the save and the field is flagged inline.
 *
 * The API enforces the same rule server-side as a second line of defence, but
 * only on the fields a request submits — the frontend is the layer that knows
 * the whole form, so it owns "you never filled this in".
 */

// Layout containers whose children share the parent's data namespace — recurse
// into these. NOT list/array/elements: their children are per-item templates
// with relative names (e.g. `.class`) that aren't real top-level data paths.
const RECURSE_TYPES = new Set([
	'tabs', 'tab', 'section', 'fieldset', 'columns', 'column', 'conditional', 'page-exists',
]);

// Mirror FieldRenderer's suppression so we never demand a field the UI hides.
const SUPPRESSED_NAMES = new Set([
	'order_title', 'header.order_by', 'header.order_manual', 'enabled',
	'health_status', 'active_triggers',
]);
const SUPPRESSED_TYPES = new Set(['order', 'blueprint', 'hidden', 'spacer', 'display']);

/** Resolve a dot-path against a (possibly nested) data object. */
export function getByPath(data: Record<string, unknown> | undefined, path: string): unknown {
	if (!data) return undefined;
	let current: unknown = data;
	for (const part of path.split('.')) {
		if (current === null || current === undefined || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

/** A value counts as "empty" for a required check. Numbers and booleans don't. */
export function isEmpty(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(value as object).length === 0;
	return false;
}

/** Build the inline error message for a single required field, or null if it's filled. */
function requiredErrorFor(
	field: BlueprintField,
	data: Record<string, unknown> | undefined,
): string | null {
	const value = getByPath(data, field.name);
	// A field showing its blueprint default isn't empty — the default is what gets saved.
	const effective = isEmpty(value) ? field.default : value;
	if (!isEmpty(effective)) return null;
	// A blueprint-supplied validate.message wins, matching admin-classic. It may be
	// a translation key, so run it through tMaybe.
	if (field.validate?.message) return i18n.tMaybe(field.validate.message);
	const label = field.label ? i18n.tMaybe(field.label) : '';
	return label
		? i18n.t('ADMIN_NEXT.VALIDATION.FIELD_REQUIRED', { label })
		: i18n.t('ADMIN_NEXT.VALIDATION.REQUIRED_GENERIC');
}

/** Find a leaf field definition by its dotted data-path, recursing only layout containers. */
function findFieldByName(fields: BlueprintField[], name: string): BlueprintField | undefined {
	for (const field of fields) {
		const isContainer = RECURSE_TYPES.has(field.type);
		if (!isContainer && field.name === name) return field;
		if (isContainer && field.fields?.length) {
			const found = findFieldByName(field.fields, name);
			if (found) return found;
		}
	}
	return undefined;
}

/** Collect required leaf fields, recursing through layout containers only. */
function collectRequired(fields: BlueprintField[], out: BlueprintField[]): void {
	for (const field of fields) {
		const isContainer = RECURSE_TYPES.has(field.type);
		if (
			field.validate?.required === true
			&& !isContainer
			&& !SUPPRESSED_NAMES.has(field.name)
			&& !SUPPRESSED_TYPES.has(field.type)
		) {
			out.push(field);
		}
		if (field.fields?.length && isContainer) {
			collectRequired(field.fields, out);
		}
	}
}

/**
 * Validate required fields against the current form data.
 * @returns a map of field-path → error message for every empty required field.
 */
export function validateRequiredFields(
	fields: BlueprintField[],
	data: Record<string, unknown> | undefined,
): Record<string, string> {
	const required: BlueprintField[] = [];
	collectRequired(fields, required);

	const errors: Record<string, string> = {};
	for (const field of required) {
		const error = requiredErrorFor(field, data);
		if (error) errors[field.name] = error;
	}
	return errors;
}

/**
 * Validate a single field by its data-path against the current form data.
 * Returns an error message (empty required field) or null. Used to re-check a
 * field the moment it's edited, so clearing a required field flags it inline
 * and re-enables once filled — without flagging untouched fields on load.
 */
export function validateFieldAt(
	fields: BlueprintField[],
	path: string,
	data: Record<string, unknown> | undefined,
): string | null {
	const field = findFieldByName(fields, path);
	if (
		!field
		|| field.validate?.required !== true
		|| SUPPRESSED_NAMES.has(field.name)
		|| SUPPRESSED_TYPES.has(field.type)
	) {
		return null;
	}
	return requiredErrorFor(field, data);
}

/**
 * True when any required field is currently empty. A cheap reactive gate for
 * the Save button: keep it disabled while the form can't legally be saved
 * (getgrav/grav-plugin-admin2#34, #35).
 */
export function hasRequiredErrors(
	fields: BlueprintField[],
	data: Record<string, unknown> | undefined,
): boolean {
	const required: BlueprintField[] = [];
	collectRequired(fields, required);
	return required.some((field) => requiredErrorFor(field, data) !== null);
}

/**
 * Deep-clone `data` dropping empty leaves and branches (empty string/array/object,
 * null, undefined). Used for dirty comparison so that typing into a required
 * field and then clearing it — leaving an empty string where the original had
 * no key at all — no longer registers as a change (admin2#34). A field cleared
 * from a real value still differs (the real value survives pruning on one side).
 */
export function pruneEmpty(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(pruneEmpty).filter((v) => !isEmpty(v));
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			const pruned = pruneEmpty(val);
			if (!isEmpty(pruned)) out[key] = pruned;
		}
		return out;
	}
	return value;
}

/** Stable JSON of `data` with empty values pruned, for dirty/changed comparisons. */
export function stableJson(data: unknown): string {
	return JSON.stringify(pruneEmpty(data));
}

/**
 * Validate, and if anything fails show a summary toast. Returns the error map
 * so the caller can bind it to the form and block the save. Use at the top of a
 * save handler:
 *
 *   const errors = checkRequiredOrToast(fields, data);
 *   validationErrors = errors;
 *   if (Object.keys(errors).length) { scrollToFirstError(); return; }
 */
export function checkRequiredOrToast(
	fields: BlueprintField[],
	data: Record<string, unknown> | undefined,
): Record<string, string> {
	const errors = validateRequiredFields(fields, data);
	const count = Object.keys(errors).length;
	if (count > 0) {
		toast.error(i18n.t('ADMIN_NEXT.VALIDATION.FORM_HAS_ERRORS', { count }));
	}
	return errors;
}

/** Scroll the first inline field error into view (call after rendering errors). */
export function scrollToFirstError(): void {
	if (typeof document === 'undefined') return;
	// Defer a frame so the inline error nodes have rendered.
	requestAnimationFrame(() => {
		const el = document.querySelector('[data-field-error]');
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});
}
