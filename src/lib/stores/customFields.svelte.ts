/**
 * Registry of custom field types provided by plugins via web components.
 *
 * Populated when a plugin config page loads and the plugin response
 * includes a `custom_fields` map. The FieldRenderer checks this
 * registry before falling back to RawField for unknown types.
 */

/** Map of field type name → plugin slug that provides it */
let registry = $state<Record<string, string>>({});

export const customFieldRegistry = {
	get types() { return registry; },

	/**
	 * Register custom field types from a plugin.
	 * Called when a plugin detail response includes custom_fields.
	 */
	register(pluginSlug: string, fieldTypes: Record<string, string>) {
		for (const fieldType of Object.keys(fieldTypes)) {
			registry[fieldType] = pluginSlug;
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
	 * Get the plugin slug that provides a custom field type.
	 */
	getPluginSlug(fieldType: string): string | undefined {
		return registry[fieldType];
	},

	/**
	 * Clear all registrations (useful when navigating away).
	 */
	clear() {
		registry = {};
	},
};
