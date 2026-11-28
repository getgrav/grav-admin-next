import { queueUserPatch } from './_serverSync';
import { loadBootCache, saveBootCache, bootConfigAppearance } from './_bootCache';
import type { PreferencesResponse, ColorMode as ServerColorMode, DarkShade } from '$lib/api/endpoints/preferences';
import { accentTokens } from '$lib/utils/accent';

/**
 * Visible color mode applied to the DOM. The server allows '' (empty) which
 * means "follow the OS preference"; the store resolves that to 'light' or
 * 'dark' for rendering but keeps the user's intent ('' / 'light' / 'dark')
 * available for the settings page.
 */
type ColorMode = 'light' | 'dark';

export interface AccentColor {
	label: string;
	hue: number;
	saturation: number;
}

export const ACCENT_PRESETS: AccentColor[] = [
	{ label: 'Grav',    hue: 271, saturation: 91 },
	{ label: 'Blue',    hue: 221, saturation: 83 },
	{ label: 'Violet',  hue: 263, saturation: 70 },
	{ label: 'Rose',    hue: 347, saturation: 77 },
	{ label: 'Orange',  hue: 25,  saturation: 95 },
	{ label: 'Amber',   hue: 38,  saturation: 92 },
	{ label: 'Emerald', hue: 160, saturation: 84 },
	{ label: 'Teal',    hue: 172, saturation: 66 },
	{ label: 'Cyan',    hue: 192, saturation: 91 },
	{ label: 'Zinc',    hue: 240, saturation: 6 },
];

/**
 * How dark mode looks. The real colours live in layout.css under
 * `.dark[data-dark-shade=...]`; `sidebar` and `card` here only paint the small
 * swatches on the Settings page (the two tones tell the shades apart better
 * than background and card), so keep them in step with that file.
 */
export interface DarkShadeOption {
	value: DarkShade;
	label: string;
	sidebar: string;
	card: string;
}

export const DARK_SHADES: DarkShadeOption[] = [
	{ value: 'graphite', label: 'Graphite', sidebar: 'hsl(220 4% 16%)',   card: 'hsl(220 4% 18%)' },
	{ value: 'zinc',     label: 'Onyx',     sidebar: 'hsl(240 5.9% 10%)', card: 'hsl(240 4.5% 13%)' },
	{ value: 'midnight', label: 'Midnight', sidebar: 'hsl(222 28% 7%)',   card: 'hsl(222 26% 12%)' },
];

const DEFAULT_SHADE: DarkShade = 'graphite';

function asShade(value: unknown): DarkShade {
	return DARK_SHADES.some(s => s.value === value) ? (value as DarkShade) : DEFAULT_SHADE;
}

const DEFAULT_HUE = 271;
const DEFAULT_SAT = 91;

function osPrefersDark(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveColorMode(intent: ServerColorMode): ColorMode {
	if (intent === 'light' || intent === 'dark') return intent;
	return osPrefersDark() ? 'dark' : 'light';
}

function createThemeStore() {
	const cache = loadBootCache();
	const site = bootConfigAppearance();
	// User intent: '' = follow OS, 'light' or 'dark' explicit. Seeded from
	// the boot cache so the first paint uses the user's last-known accent
	// and color mode, or failing that from the site defaults admin2.php puts
	// in the boot config, rather than the built-in Grav purple.
	let intent = $state<ServerColorMode>(cache?.colorMode ?? site.colorMode ?? '');
	let colorMode = $state<ColorMode>(resolveColorMode(intent));
	let accentHue = $state<number>(cache?.accentHue ?? site.accentHue ?? DEFAULT_HUE);
	let accentSaturation = $state<number>(cache?.accentSaturation ?? site.accentSaturation ?? DEFAULT_SAT);
	let darkShade = $state<DarkShade>(asShade(cache?.darkShade ?? site.darkShade));

	const isDark = $derived(colorMode === 'dark');

	function applyColorMode(): void {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		if (colorMode === 'dark') html.classList.add('dark');
		else html.classList.remove('dark');
	}

	function applyAccent(): void {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		// Lightness and the button label are fitted for contrast against this
		// mode's surfaces, which differ per dark shade (see utils/accent.ts).
		const tokens = accentTokens(accentHue, accentSaturation, html.classList.contains('dark'), darkShade);
		html.style.setProperty('--primary', tokens.primary);
		html.style.setProperty('--primary-foreground', tokens.primaryForeground);
		html.style.setProperty('--primary-text', tokens.primaryText);
		html.style.setProperty('--ring', tokens.ring);
		// The checkbox tick is an SVG in layout.css and cannot read a variable.
		html.dataset.accentLabel = tokens.darkLabel ? 'dark' : 'light';
	}

	function applyShade(): void {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.darkShade = darkShade;
	}

	function applyAll(): void {
		applyColorMode();
		applyShade();
		applyAccent();
	}

	applyAll();

	// Re-resolve OS-driven color mode if the user is in '' (system) mode.
	if (typeof window !== 'undefined' && window.matchMedia) {
		try {
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
				if (intent !== '') return;
				colorMode = osPrefersDark() ? 'dark' : 'light';
				applyAll();
			});
		} catch {
			/* older browsers — non-fatal */
		}
	}

	function init(payload: PreferencesResponse): void {
		intent = payload.effective.colorMode;
		accentHue = payload.effective.accentHue;
		accentSaturation = payload.effective.accentSaturation;
		darkShade = asShade(payload.effective.darkShade);
		colorMode = resolveColorMode(intent);
		applyAll();
		saveBootCache(payload);
	}

	return {
		get colorMode() { return colorMode; },
		get colorModeIntent() { return intent; },
		get isDark() { return isDark; },
		get accentHue() { return accentHue; },
		get accentSaturation() { return accentSaturation; },
		get darkShade() { return darkShade; },

		toggleColorMode(): void {
			const next: ColorMode = colorMode === 'dark' ? 'light' : 'dark';
			intent = next;
			colorMode = next;
			applyAll();
			queueUserPatch('colorMode', next);
		},

		setColorMode(mode: ColorMode | ''): void {
			intent = mode;
			colorMode = resolveColorMode(mode);
			applyAll();
			queueUserPatch('colorMode', mode);
		},

		setAccent(hue: number, saturation: number): void {
			accentHue = hue;
			accentSaturation = saturation;
			applyAccent();
			queueUserPatch('accentHue', hue);
			queueUserPatch('accentSaturation', saturation);
		},

		setAccentHue(hue: number): void {
			accentHue = hue;
			applyAccent();
			queueUserPatch('accentHue', hue);
		},

		setDarkShade(shade: DarkShade): void {
			darkShade = asShade(shade);
			applyShade();
			applyAccent();
			queueUserPatch('darkShade', darkShade);
		},

		resetColorModeToSiteDefault(siteIntent: ServerColorMode | undefined): void {
			const next = siteIntent ?? '';
			intent = next;
			colorMode = resolveColorMode(next);
			applyAll();
			queueUserPatch('colorMode', null);
		},

		/**
		 * Paint the site defaults from the boot config without touching the
		 * server: the sign-in screen uses it once nobody is signed in.
		 */
		paintSiteDefaults(): void {
			const site = bootConfigAppearance();
			intent = site.colorMode ?? '';
			colorMode = resolveColorMode(intent);
			accentHue = site.accentHue ?? DEFAULT_HUE;
			accentSaturation = site.accentSaturation ?? DEFAULT_SAT;
			darkShade = asShade(site.darkShade);
			applyAll();
		},

		resetDarkShadeToSiteDefault(siteShade: DarkShade | undefined): void {
			darkShade = asShade(siteShade);
			applyShade();
			applyAccent();
			queueUserPatch('darkShade', null);
		},

		resetAccentToSiteDefault(siteHue: number | undefined, siteSat: number | undefined): void {
			accentHue = siteHue ?? DEFAULT_HUE;
			accentSaturation = siteSat ?? DEFAULT_SAT;
			applyAccent();
			queueUserPatch('accentHue', null);
			queueUserPatch('accentSaturation', null);
		},

		init,
	};
}

export const theme = createThemeStore();
