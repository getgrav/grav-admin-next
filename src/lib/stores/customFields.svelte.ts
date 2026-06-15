/**
 * Registry of custom field types provided by plugins or themes via web components.
 *
 * Populated at boot from `/custom-fields`, and when a plugin/theme detail page
 * loads and its response includes a `custom_fields` map. The FieldRenderer checks
 * this registry before falling back to RawField for unknown types.
 *
 * Each entry records the provider `kind` ('plugins' | 'themes') so the field
 * script is fetched from the correct `/gpm/{kind}/{slug}/field/{type}` route —
 * a theme-provided field lives under `theme://`, not `plugin://`.
 */

export type ProviderKind = 'plugins' | 'themes';

export interface FieldProvider {
	slug: string;
	kind: ProviderKind;
}

/** Map of field type name → provider that supplies it */
let registry = $state<Record<string, FieldProvider>>({});

export const customFieldRegistry = {
	get types() { return registry; },

	/**
	 * Register custom field types from a plugin or theme.
	 * Called when a detail response includes custom_fields, or at boot from
	 * the aggregate `/custom-fields` map.
	 */
	register(slug: string, fieldTypes: Record<string, string>, kind: ProviderKind = 'plugins') {
		for (const fieldType of Object.keys(fieldTypes)) {
			registry[fieldType] = { slug, kind };
		}
		registry = { ...registry }; // trigger reactivity
	},

	/**
	 * Check if a field type has a registered custom component.
	 */
	has(fieldType: string): boolean {
		return fieldType in registry;
	},

	/**
	 * Get the provider (slug + kind) for a custom field type.
	 */
	getProvider(fieldType: string): FieldProvider | undefined {
		return registry[fieldType];
	},

	/**
	 * Get the slug that provides a custom field type.
	 * @deprecated prefer {@link getProvider} so the provider kind is preserved.
	 */
	getPluginSlug(fieldType: string): string | undefined {
		return registry[fieldType]?.slug;
	},

	/**
	 * Clear all registrations (useful when navigating away).
	 */
	clear() {
		registry = {};
	},
};
