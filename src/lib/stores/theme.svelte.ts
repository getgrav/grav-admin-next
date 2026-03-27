const THEME_STORAGE_KEY = 'grav_admin_theme';

type ColorMode = 'light' | 'dark';

interface StoredTheme {
	colorMode: ColorMode;
	accentHue: number;
}

function loadStored(): StoredTheme {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch { /* use defaults */ }

	// Default to system preference
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	return { colorMode: prefersDark ? 'dark' : 'light', accentHue: 256 };
}

function createThemeStore() {
	const stored = loadStored();

	let colorMode = $state<ColorMode>(stored.colorMode);
	let accentHue = $state(stored.accentHue);

	const isDark = $derived(colorMode === 'dark');

	function persist() {
		localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ colorMode, accentHue }));
	}

	function applyColorMode() {
		const html = document.documentElement;
		if (colorMode === 'dark') {
			html.classList.add('dark');
		} else {
			html.classList.remove('dark');
		}
	}

	function applyAccentHue() {
		const html = document.documentElement;
		// Override primary color hue across the scale
		for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
			const current = getComputedStyle(html).getPropertyValue(`--color-primary-${shade}`);
			if (current) {
				const parts = current.trim().match(/oklch\(([^ ]+) ([^ ]+) ([^)]+)\)/);
				if (parts) {
					html.style.setProperty(
						`--color-primary-${shade}`,
						`oklch(${parts[1]} ${parts[2]} ${accentHue})`
					);
				}
			}
		}
	}

	// Apply on init
	applyColorMode();
	if (stored.accentHue !== 256) {
		applyAccentHue();
	}

	return {
		get colorMode() { return colorMode; },
		get isDark() { return isDark; },
		get accentHue() { return accentHue; },

		toggleColorMode() {
			colorMode = colorMode === 'dark' ? 'light' : 'dark';
			applyColorMode();
			persist();
		},

		setColorMode(mode: ColorMode) {
			colorMode = mode;
			applyColorMode();
			persist();
		},

		setAccentHue(hue: number) {
			accentHue = hue;
			applyAccentHue();
			persist();
		}
	};
}

export const theme = createThemeStore();
