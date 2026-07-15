import { i18n } from '$lib/stores/i18n.svelte';
import type { FlexObject } from '$lib/api/endpoints/flexObjects';

/**
 * Render a flex directory's `edit.title.template` against an object.
 *
 * This is a deliberately small subset of Twig: `{{ object.field ?? 'fallback' }}`
 * with an optional filter chain (`|tu`, `|t`, ...). The fallback runs through
 * i18n.tMaybe(), so a lang-key fallback (e.g. 'PLUGIN_NEWS.CREATE_NEWS') is
 * translated/humanized the way `|tu` would in classic admin, and a plain string
 * passes through untouched. Anything beyond this subset is not rendered.
 *
 * Pass `object: null` (the create screen) to render the template as if every
 * field were empty, so every `?? fallback` branch is taken — that branch exists
 * almost entirely for the create screen, since an existing object's field
 * normally has a value.
 *
 * Known limitation: a template with placeholders but no fallbacks and literal
 * separators (e.g. `{{ object.a }}, {{ object.b }}`) renders just the separators
 * (", ") rather than nothing. Callers that treat an empty result as "no title"
 * won't catch that case. Detecting it needs a "did any placeholder resolve" flag
 * that isn't worth the cost for how rare it is.
 */
export function renderFlexTitle(template: string, object: FlexObject | null): string {
	return template.replace(
		/\{\{\s*object\.(\w+)\s*(?:\?\?\s*'([^']*)')?\s*(?:\|\s*\w+)*\s*\}\}/g,
		(_, field: string, fallback: string) => {
			const val = object?.[field];
			if (val != null && val !== '') return String(val);
			return fallback ? i18n.tMaybe(fallback) : '';
		},
	);
}
