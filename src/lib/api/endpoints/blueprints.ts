import { api } from '../client';

export interface BlueprintField {
	name: string;
	type: string;
	label?: string;
	help?: string;
	placeholder?: string;
	default?: unknown;
	description?: string;
	/** Secondary label line, rendered under the label (admin-classic parity). */
	sublabel?: string;
	/** `false` hides the label column entirely. */
	display_label?: boolean;
	/** Extra CSS classes on the field label. */
	labelclasses?: string;
	/** Extra CSS classes on the field sublabel. */
	sublabelclasses?: string;
	/** Extra CSS classes on the wrapper holding both the label and the input. */
	outerclasses?: string;
	title?: string;
	text?: string;
	size?: string;
	disabled?: boolean;
	readonly?: boolean;
	toggleable?: boolean;
	highlight?: number;
	min?: number;
	max?: number;
	step?: number;
	minlength?: number;
	maxlength?: number;
	rows?: number;
	multiple?: boolean;
	selectize?: boolean | Record<string, unknown>;
	markdown?: boolean;
	underline?: boolean;
	prepend?: string;
	append?: string;
	options?: Array<{ value: string; label: string }>;
	data_options?: string;
	content?: string;
	validate?: {
		type?: string;
		required?: boolean;
		pattern?: string;
		/**
		 * Numeric bound on number/range, character count on text/textarea, date
		 * string on date/datetime. This is the canonical place Grav reads these
		 * from on save, so the field components must honour it as well as the
		 * top-level props (admin2#155).
		 */
		min?: number | string;
		max?: number | string;
		step?: number;
		/** Custom validation message from the blueprint, shown instead of the generic required text. */
		message?: string;
	};
	fields?: BlueprintField[];
	yaml?: boolean;
	accept?: string[];
	destination?: string;
	/** file field — store uploads under a randomized filename. */
	random_name?: boolean;
	/** file field — datetime-prefix a conflicting filename instead of overwriting. */
	avoid_overwriting?: boolean;
	/** file field — per-field maximum upload size, in megabytes. */
	filesize?: number;
	/** file field — maximum number of files when `multiple` is set. */
	limit?: number;
	style?: string;
	classes?: string;
	wrapper_classes?: string;
	autocomplete?: string;
	use?: string;
	key?: string;
	controls?: string;
	collapsed?: boolean;
	collapsible?: boolean;
	/** section/fieldset — FontAwesome icon name shown before the title. */
	icon?: string;
	sort?: boolean;
	btnLabel?: string;
	placement?: string;
	sortby?: string;
	sortby_dir?: string;
	min_height?: string;
	selectunique?: unknown;
	value_only?: boolean;
	/** array field — when false, each row renders as a constrained <select>
	 * populated from `options` / `data_options` instead of a free-form text
	 * input. Mirrors selectize's `create: false` semantic. Default true. */
	create?: boolean;
	show_all?: boolean;
	show_modular?: boolean;
	show_root?: boolean;
	show_slug?: boolean;
	placeholder_key?: string;
	placeholder_value?: string;
	value_type?: string;
	preview_images?: boolean;
	folder?: string;
	/**
	 * media field — which pickers to offer, in order: `page` (the page's own
	 * media), `site` (the `user://media` library), `url` (a typed-in address).
	 * Absent or empty means all three.
	 */
	sources?: string[];
	condition?: string;
	translate?: boolean;
	/** colorpicker — when false, hides the alpha slider and emits a 6-digit
	 * #RRGGBB hex (matches Grav's classic colorpicker convention). Defaults
	 * to true so the slider is shown and 8-digit #RRGGBBAA may be emitted. */
	alpha?: boolean;
}

export interface BlueprintSchema {
	name: string;
	title: string;
	type?: string;
	child_type?: string;
	validation: string;
	fields: BlueprintField[];
	defaults?: Record<string, unknown>;
}

export interface PageType {
	type: string;
	label: string;
}

export async function getPageTypes(modular?: boolean): Promise<PageType[]> {
	const params = modular ? { modular: 'true' } : undefined;
	return api.get<PageType[]>('/blueprints/pages', params);
}

/**
 * Header-relative keys of the date/datetime fields a new page should seed with
 * the current time on create (e.g. `date`, `publish_date`, a theme's custom
 * `event_date`).
 *
 * This reproduces Grav 1.7's datetime widget, which pre-filled an empty date
 * input with "now" so a freshly created page carried a date the author never
 * had to type. The new-admin create request is lighter — it renders no
 * blueprint form — so the seed is computed here from the template blueprint and
 * sent as an explicit header value.
 *
 * A field qualifies only when it is:
 *   - typed `datetime`/`date` — so the rule is generic, not pinned to one field
 *     name;
 *   - NOT `toggleable` — opt-in fields carry a placeholder default, not a value
 *     to persist (this is also exactly what the API drops server-side, so the
 *     two stay in lockstep);
 *   - empty/blank by default — a real default is a value the author chose and
 *     the server already keeps, so we must not overwrite it with now.
 */
export function emptyDateFieldKeys(schema: BlueprintSchema): string[] {
	const keys: string[] = [];

	const walk = (fields: BlueprintField[] | undefined): void => {
		if (!fields) return;
		for (const field of fields) {
			// Containers (tabs/sections/fieldsets) nest their own fields; recurse
			// before the leaf check so nested date fields are still found.
			walk(field.fields);

			if (field.type !== 'datetime' && field.type !== 'date') continue;
			if (field.toggleable) continue;

			const def = field.default;
			if (def !== undefined && def !== null && def !== '') continue;

			// Field names arrive as the full frontmatter path (`header.date`); the
			// create payload's `header` object is the frontmatter itself, so strip
			// the prefix to a header-relative key.
			if (typeof field.name === 'string' && field.name.startsWith('header.')) {
				keys.push(field.name.slice('header.'.length));
			}
		}
	};

	walk(schema.fields);
	return keys;
}

/**
 * The template's own default for `header.published`, or undefined when the
 * blueprint states none (in which case Grav's implicit default, published,
 * applies).
 */
export function publishedDefault(schema: BlueprintSchema): boolean | undefined {
	let found: boolean | undefined;

	const walk = (fields: BlueprintField[] | undefined): void => {
		if (!fields || found !== undefined) return;
		for (const field of fields) {
			walk(field.fields);
			if (field.name === 'header.published' && typeof field.default === 'boolean') {
				found = field.default;
				return;
			}
		}
	};

	walk(schema.fields);
	return found;
}

export async function getPageBlueprint(template: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/pages/${template}`);
}

export async function getPluginBlueprint(plugin: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/plugins/${plugin}`);
}

export async function getThemeBlueprint(theme: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/themes/${theme}`);
}

export async function getConfigBlueprint(scope: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/config/${scope}`);
}

export async function getUserBlueprint(): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>('/blueprints/users');
}

export async function getGroupBlueprint(): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>('/blueprints/groups');
}

export async function getGroupNewBlueprint(): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>('/blueprints/groups/new');
}

export async function getAccountsConfigBlueprint(): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>('/blueprints/config/accounts');
}

export interface PermissionAction {
	name: string;
	label: string;
	children?: PermissionAction[];
}

export async function getPermissionsBlueprint(): Promise<PermissionAction[]> {
	return api.get<PermissionAction[]>('/blueprints/users/permissions');
}
