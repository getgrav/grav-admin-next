/**
 * The template name to name in the "this module's template is missing" notice,
 * or null when there is nothing to warn about (getgrav/grav-plugin-api#55).
 *
 * The API sets `template_missing` on a module whose template doesn't exist on
 * the site, so the page the module belongs to shows core's "template not
 * found" error. That describes the saved page. Once the editor's template
 * picker holds a different template the notice would be about something the
 * user is already changing, so it goes away until the save shows the new
 * state.
 */
export function missingModuleTemplate(
	page: { template?: string; template_missing?: boolean } | null,
	selected: string
): string | null {
	if (!page || page.template_missing !== true || !page.template) return null;
	if (selected !== '' && selected !== page.template) return null;

	return page.template;
}
