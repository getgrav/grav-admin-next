import { scopedKey } from '$lib/utils/scopedStorage';

const THEME_STORAGE_KEY = scopedKey('grav_admin_theme');

type ColorMode = 'light' | 'dark';

export interface AccentColor {
	label: string;
	hue: number;
	saturation: number;
}

/** Preset accent colors. Hue + saturation pairs for HSL. */
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

const DEFAULT_HUE = 271;
const DEFAULT_SAT = 91;

interface StoredTheme {
	colorMode: ColorMode;
	accentHue: number;
	accentSaturation: number;
}

function loadStored(): StoredTheme {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				colorMode: parsed.colorMode ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
				accentHue: parsed.accentHue ?? DEFAULT_HUE,
				accentSaturation: parsed.accentSaturation ?? DEFAULT_SAT,
			};
		}
	} catch { /* use defaults */ }

	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	return { colorMode: prefersDark ? 'dark' : 'light', accentHue: DEFAULT_HUE, accentSaturation: DEFAULT_SAT };
}

function createThemeStore() {
	const stored = loadStored();

	let colorMode = $state<ColorMode>(stored.colorMode);
	let accentHue = $state(stored.accentHue);
	let accentSaturation = $state(stored.accentSaturation);

	const isDark = $derived(colorMode === 'dark');

	function persist() {
		localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorMode, accentHue, accentSaturation }));
	}

	function applyColorMode() {
		const html = document.documentElement;
		if (colorMode === 'dark') {
			html.classList.add('dark');
		} else {
			html.classList.remove('dark');
		}
	}

	function applyAccent() {
		const html = document.documentElement;
		const h = accentHue;
		const s = accentSaturation;
		const dark = html.classList.contains('dark');
		// Dark mode L=65 ≈ Tailwind-500 (e.g. purple-500 #A855F7)
		// Light mode L=40 ≈ Tailwind-700 — kept darker for contrast on white
		const lightness = dark ? 65 : 40;
		html.style.setProperty('--primary', `hsl(${h} ${s}% ${lightness}%)`);
		html.style.setProperty('--ring', `hsl(${h} ${s}% ${dark ? 60 : 50}%)`);
	}

	function applyAll() {
		applyColorMode();
		applyAccent();
	}

	// Apply on init
	applyAll();

	return {
		get colorMode() { return colorMode; },
		get isDark() { return isDark; },
		get accentHue() { return accentHue; },
		get accentSaturation() { return accentSaturation; },

		toggleColorMode() {
			colorMode = colorMode === 'dark' ? 'light' : 'dark';
			applyAll();
			persist();
		},

		setColorMode(mode: ColorMode) {
			colorMode = mode;
			applyAll();
			persist();
		},

		setAccent(hue: number, saturation: number) {
			accentHue = hue;
			accentSaturation = saturation;
			applyAccent();
			persist();
		},

		/** Kept for backwards compat */
		setAccentHue(hue: number) {
			accentHue = hue;
			applyAccent();
			persist();
		}
	};
}

export const theme = createThemeStore();
