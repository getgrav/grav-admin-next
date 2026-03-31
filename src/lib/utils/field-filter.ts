import type { BlueprintField } from '$lib/api/endpoints/blueprints';
import { i18n } from '$lib/stores/i18n.svelte';

/**
 * Check if a field's own text properties match a filter string.
 * Does NOT recurse into children — use fieldOrDescendantMatches for that.
 */
export function fieldMatchesSelf(field: BlueprintField, query: string): boolean {
	const q = query.toLowerCase();
	const t = i18n.tMaybe;

	const texts = [
		field.label ? t(field.label) : '',
		field.help ? t(field.help) : '',
		field.name,
		field.title ? t(field.title) : '',
		field.description ? t(field.description) : '',
	];

	return texts.some((text) => text.toLowerCase().includes(q));
}

/**
 * Check if a field or any of its descendants matches a filter string.
 * Used by containers (tabs, sections) to decide whether to render at all.
 */
export function fieldMatches(field: BlueprintField, query: string): boolean {
	if (fieldMatchesSelf(field, query)) return true;
	if (field.fields) {
		return field.fields.some((child) => fieldMatches(child, query));
	}
	return false;
}
