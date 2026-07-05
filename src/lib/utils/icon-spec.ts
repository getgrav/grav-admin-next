export type SvgIconTag = 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon';

export interface SvgIconElement {
	tag: SvgIconTag;
	attrs?: Record<string, string | number>;
	attributes?: Record<string, string | number>;
}

/**
 * Icon declaration accepted by extension-provided UI surfaces.
 *
 * String values preserve the existing Font Awesome shorthand:
 * - "clock" => "fa-solid fa-clock"
 * - "fa:clock" => "fa-solid fa-clock"
 * - "fa-regular:clock" => "fa-regular fa-clock"
 * - "class:ti ti-user" => any already loaded CSS icon classes
 *
 * Both forms cost nothing at the bundle level: Font Awesome is already loaded
 * as a webfont, and `class:` reuses whatever icon CSS the admin already ships.
 * For a truly custom glyph, plugins send structured SVG data (below) rather
 * than pulling a whole icon library into the admin bundle.
 *
 * Structured SVG icons intentionally accept only data, not raw SVG markup.
 * The renderer whitelists SVG tags and attributes before creating DOM nodes.
 */
export type IconSpec =
	| string
	| {
			type: 'class';
			class: string;
	  }
	| {
			type: 'svg';
			viewBox?: string;
			path?: string;
			elements?: SvgIconElement[];
			children?: SvgIconElement[];
	  };

type ResolvedIcon =
	| { type: 'class'; className: string }
	| { type: 'svg'; viewBox: string; elements: { tag: SvgIconTag; attrs: Record<string, string> }[] };

const SVG_TAGS = new Set<SvgIconTag>(['path', 'circle', 'rect', 'line', 'polyline', 'polygon']);
const SVG_ATTRS = new Set([
	'd',
	'cx',
	'cy',
	'r',
	'x',
	'y',
	'x1',
	'y1',
	'x2',
	'y2',
	'rx',
	'ry',
	'width',
	'height',
	'points',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
]);

export function resolveIconSpec(icon: IconSpec | null | undefined): ResolvedIcon | null {
	if (!icon) return null;

	if (typeof icon === 'string') {
		const value = icon.trim();
		if (!value) return null;
		const className = iconClassFromString(value);
		return className ? { type: 'class', className } : null;
	}

	if (icon.type === 'class') {
		const className = icon.class.trim();
		return className ? { type: 'class', className } : null;
	}

	if (icon.type === 'svg') {
		const elements = sanitizeSvgElements(
			icon.elements ?? icon.children ?? (icon.path ? [{ tag: 'path', attrs: { d: icon.path } }] : []),
		);
		if (elements.length === 0) return null;
		return {
			type: 'svg',
			viewBox: validViewBox(icon.viewBox) ? icon.viewBox!.trim() : '0 0 24 24',
			elements,
		};
	}

	return null;
}

function iconClassFromString(value: string): string {
	if (value.startsWith('class:')) return value.slice(6).trim();
	if (value.includes(' ')) return value;
	if (value.startsWith('fa:')) return fontAwesomeClass(value.slice(3));
	if (value.startsWith('fa-solid:')) return fontAwesomeClass(value.slice(9), 'solid');
	if (value.startsWith('fa-regular:')) return fontAwesomeClass(value.slice(11), 'regular');
	if (value.startsWith('fa-brands:')) return fontAwesomeClass(value.slice(10), 'brands');

	return fontAwesomeClass(value);
}

function fontAwesomeClass(name: string, style = 'solid'): string {
	const icon = name.replace(/^fa-/, '');
	const family = style.startsWith('fa-') ? style : `fa-${style}`;
	return `${family} fa-${icon}`;
}

function validViewBox(value: string | undefined): boolean {
	return typeof value === 'string' && value.length <= 64 && /^[0-9.+\-\s]+$/.test(value.trim());
}

function sanitizeSvgElements(elements: SvgIconElement[]): { tag: SvgIconTag; attrs: Record<string, string> }[] {
	return elements.slice(0, 24).flatMap((element) => {
		const tag = String(element?.tag ?? '').toLowerCase() as SvgIconTag;
		if (!SVG_TAGS.has(tag)) return [];

		const attrs: Record<string, string> = {};
		const source = element.attrs ?? element.attributes ?? {};
		for (const [name, value] of Object.entries(source)) {
			const attr = name.toLowerCase();
			if (!SVG_ATTRS.has(attr) || !validSvgValue(attr, value)) continue;
			attrs[attr] = String(value);
		}

		return Object.keys(attrs).length > 0 ? [{ tag, attrs }] : [];
	});
}

function validSvgValue(name: string, value: string | number): boolean {
	const text = String(value);
	if (text.length > 512) return false;
	if (name === 'd') return /^[MmZzLlHhVvCcSsQqTtAa0-9.,+\-\s]+$/.test(text);
	if (name === 'points') return /^[0-9.,+\-\s]+$/.test(text);
	if (name === 'stroke-linecap' || name === 'stroke-linejoin') return /^(butt|round|square|miter|bevel|arcs)$/.test(text);
	return /^[0-9.+\-\s]+$/.test(text);
}
