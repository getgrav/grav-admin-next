import type { DarkShade } from '$lib/api/endpoints/preferences';

/**
 * The colours the admin builds from the accent hue and saturation
 * (getgrav/grav-plugin-admin2#229).
 *
 * Only hue and saturation are stored. Lightness starts from a fixed value per
 * colour mode (40% light, 65% dark), but HSL lightness is not perceptual: at
 * the same L, blue and violet are dark while green and yellow are light. So
 * when the fixed value leaves accent text (links, `text-primary`) under 4.5:1
 * on one of the surfaces it sits on, or on the `bg-primary/10` tint of one
 * (the active sidebar item, accent chips), the lightness moves, darker in
 * light mode and lighter in dark mode, just far enough to reach it. An accent
 * that already passes keeps exactly the colour it had.
 *
 * The label on accent buttons stays white while white reaches 4.5:1 on the
 * accent, otherwise it becomes whichever of white and near-black contrasts
 * more. The focus ring is fitted the same way at 3:1, the minimum for a
 * non-text indicator.
 */

export type Hsl = readonly [hue: number, saturation: number, lightness: number];
export type Rgb = readonly [r: number, g: number, b: number];

/**
 * Page, card, popover and sidebar, for light mode and each dark shade. Accent
 * text appears on all four. Keep in step with layout.css (a test reads it).
 */
export const ACCENT_SURFACES: Record<'light' | DarkShade, readonly Hsl[]> = {
	light:    [[0, 0, 100], [0, 0, 100], [0, 0, 100], [0, 0, 98]],
	graphite: [[220, 4, 15], [220, 4, 18], [220, 4, 21], [220, 4, 16]],
	zinc:     [[240, 6, 10.6], [240, 4.5, 13], [240, 4.5, 14.5], [240, 5.9, 10]],
	midnight: [[222, 28, 9], [222, 26, 12], [222, 24, 14], [222, 28, 7]],
};

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;
/** `bg-primary/10`: accent text on a tenth of the accent over a surface. */
const TINT = 0.1;
const WHITE: Hsl = [0, 0, 100];
/** The light-mode --foreground. */
const NEAR_BLACK: Hsl = [240, 10, 3.9];

export interface AccentTokens {
	/** The lightness actually used for --primary. */
	lightness: number;
	primary: string;
	primaryForeground: string;
	/** True when the button label is near-black rather than white. */
	darkLabel: boolean;
	ring: string;
}

export function accentTokens(hue: number, saturation: number, dark: boolean, shade: DarkShade = 'graphite'): AccentTokens {
	const surfaces = dark ? (ACCENT_SURFACES[shade] ?? ACCENT_SURFACES.graphite) : ACCENT_SURFACES.light;
	const lightness = fitLightness(hue, saturation, dark ? 65 : 40, dark, surfaces, TEXT_MIN, true);
	const ringLightness = fitLightness(hue, saturation, dark ? 60 : 50, dark, surfaces, NON_TEXT_MIN, false);

	const fill = toRgb([hue, saturation, lightness]);
	const onWhite = contrastRatio(toRgb(WHITE), fill);
	const darkLabel = onWhite < TEXT_MIN && contrastRatio(toRgb(NEAR_BLACK), fill) > onWhite;

	return {
		lightness,
		primary: css([hue, saturation, lightness]),
		primaryForeground: css(darkLabel ? NEAR_BLACK : WHITE),
		darkLabel,
		ring: css([hue, saturation, ringLightness]),
	};
}

/**
 * Walk lightness from `start` (up in dark mode, down in light mode) to the
 * first value that reaches `min` on every surface, and with `tinted` on the
 * accent tint over it too. Luminance only rises with L, so the walk always
 * ends, at white or black at the latest.
 */
function fitLightness(hue: number, saturation: number, start: number, dark: boolean, surfaces: readonly Hsl[], min: number, tinted: boolean): number {
	const backs = surfaces.map(toRgb);
	const step = dark ? 0.5 : -0.5;
	for (let l = start; l >= 0 && l <= 100; l += step) {
		const c = toRgb([hue, saturation, l]);
		if (backs.every(bg => contrastRatio(c, bg) >= min && (!tinted || contrastRatio(c, tint(c, bg)) >= min))) return l;
	}
	return dark ? 100 : 0;
}

/** `color` at TINT opacity over `bg`, as the browser composites it. */
export function tint(color: Rgb, bg: Rgb): Rgb {
	const mix = (i: 0 | 1 | 2) => Math.round(color[i] * TINT + bg[i] * (1 - TINT));
	return [mix(0), mix(1), mix(2)];
}

/** WCAG 2 contrast ratio of two 8-bit colours (see toRgb). */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance(color: Rgb): number {
	const [r, g, b] = color.map(c => {
		const v = c / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The 8-bit colour the browser actually paints for an hsl() value. */
export function toRgb([h, s, l]: Hsl): Rgb {
	const sat = s / 100;
	const lig = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = sat * Math.min(lig, 1 - lig);
	const f = (n: number) => Math.round(255 * (lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
	return [f(0), f(8), f(4)];
}

function css([h, s, l]: Hsl): string {
	return `hsl(${h} ${s}% ${l}%)`;
}
