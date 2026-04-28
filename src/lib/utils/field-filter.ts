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
 *
 * For `type: list` fields, the static field definition rarely contains the
 * substring a user is searching for (they want to find a row by its key or by
 * a value the user typed in earlier — e.g. "jpg" in `/admin/config/media`).
 * When `value` is supplied, lists are matched additionally against their data
 * so the container renders and `ListField`'s own per-item filter can take over.
 */
export function fieldMatches(field: BlueprintField, query: string, value?: unknown): boolean {
	if (fieldMatchesSelf(field, query)) return true;
	if (field.type === 'list' && value !== undefined && listValueMatches(value, query)) {
		return true;
	}
	if (field.fields) {
		return field.fields.some((child) => fieldMatches(child, query));
	}
	return false;
}

function listValueMatches(value: unknown, query: string): boolean {
	const q = query.toLowerCase();
	if (!q) return false;

	if (Array.isArray(value)) {
		return value.some((item) => deepMatch(item, q));
	}
	if (value !== null && typeof value === 'object') {
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (k.toLowerCase().includes(q)) return true;
			if (deepMatch(v, q)) return true;
		}
	}
	return false;
}

function deepMatch(item: unknown, q: string): boolean {
	if (item == null) return false;
	if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
		return String(item).toLowerCase().includes(q);
	}
	if (Array.isArray(item)) return item.some((v) => deepMatch(v, q));
	if (typeof item === 'object') return Object.values(item).some((v) => deepMatch(v, q));
	return false;
}
