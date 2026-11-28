import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCENT_SURFACES, accentTokens, contrastRatio, tint, toRgb, type Hsl } from '../src/lib/utils/accent.ts';

// The accent used to be built at a fixed HSL lightness, so links failed 4.5:1
// in dark mode for blue and violet, and white button labels failed for green,
// yellow and most hues in dark mode (getgrav/grav-plugin-admin2#229).

const parse = (value: string): Hsl => {
	const m = value.match(/hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)/);
	assert.ok(m, `not an hsl() value: ${value}`);
	return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const SHADES = ['graphite', 'zinc', 'midnight'] as const;
const modes = [
	{ dark: false, shade: 'graphite' as const, surfaces: ACCENT_SURFACES.light },
	...SHADES.map(shade => ({ dark: true, shade, surfaces: ACCENT_SURFACES[shade] })),
];

test('the surfaces match layout.css', () => {
	const css = readFileSync(join(import.meta.dirname, '../src/routes/layout.css'), 'utf8');
	const block = (selector: string) => {
		const start = css.indexOf(`${selector} {`);
		assert.ok(start >= 0, `missing ${selector}`);
		return css.slice(start, css.indexOf('}', start));
	};
	const tokens = (selector: string) => {
		const body = block(selector);
		return ['background', 'card', 'popover', 'sidebar'].map(name => {
			const m = body.match(new RegExp(`--${name}: (hsl\\([^)]+\\));`));
			assert.ok(m, `${selector} has no --${name}`);
			return parse(m[1]);
		});
	};
	assert.deepEqual(ACCENT_SURFACES.light, tokens('\t:root'));
	assert.deepEqual(ACCENT_SURFACES.graphite, tokens('\t.dark'));
	assert.deepEqual(ACCENT_SURFACES.zinc, tokens('.dark[data-dark-shade="zinc"]'));
	assert.deepEqual(ACCENT_SURFACES.midnight, tokens('.dark[data-dark-shade="midnight"]'));
});

test('every hue and saturation reaches AA in every mode and shade', () => {
	for (const { dark, shade, surfaces } of modes) {
		for (let hue = 0; hue < 360; hue += 1) {
			for (const sat of [0, 6, 30, 50, 70, 83, 91, 100]) {
				const t = accentTokens(hue, sat, dark, shade);
				const fill = toRgb(parse(t.primary));
				const text = toRgb(parse(t.primaryText));
				const where = `${hue}/${sat} ${dark ? shade : 'light'}`;
				for (const surface of surfaces) {
					const bg = toRgb(surface);
					assert.ok(contrastRatio(text, bg) >= 4.5, `link ${where}`);
					assert.ok(contrastRatio(text, tint(fill, bg)) >= 4.5, `active item ${where}`);
					assert.ok(contrastRatio(toRgb(parse(t.ring)), bg) >= 3, `ring ${where}`);
				}
				assert.ok(contrastRatio(toRgb(parse(t.primaryForeground)), fill) >= 4.5, `label ${where}`);
			}
		}
	}
});

test('an accent that already passes keeps its colour', () => {
	// The default Grav purple in light mode.
	assert.deepEqual(accentTokens(271, 91, false), {
		lightness: 40,
		primary: 'hsl(271 91% 40%)',
		primaryForeground: 'hsl(0 0% 100%)',
		darkLabel: false,
		textLightness: 40,
		primaryText: 'hsl(271 91% 40%)',
		ring: 'hsl(271 91% 50%)',
	});
});

test('the fill never lightens and never darkens by more than 15 points', () => {
	for (const { dark, shade } of modes) {
		const start = dark ? 65 : 40;
		for (let hue = 0; hue < 360; hue += 1) {
			const t = accentTokens(hue, 91, dark, shade);
			assert.ok(t.lightness <= start && start - t.lightness <= 15, `${hue} ${t.lightness}`);
		}
	}
});

test('purples and blues keep white labels; bright greens and yellows get dark ones in dark mode', () => {
	// The Grav, Blue, Violet and Rose presets.
	for (const [hue, sat] of [[271, 91], [217, 91], [262, 83], [346, 77]]) assert.equal(accentTokens(hue, sat, true, 'graphite').darkLabel, false, `${hue}`);
	for (const hue of [38, 60, 120, 160]) {
		const t = accentTokens(hue, 91, true, 'graphite');
		assert.equal(t.darkLabel, true, `${hue}`);
		assert.equal(t.lightness, 65);
	}
	// Light mode keeps white labels on every preset-strength hue.
	for (let hue = 0; hue < 360; hue += 1) assert.equal(accentTokens(hue, 91, false).darkLabel, false, `${hue}`);
});

test('the default purple keeps a strong fill in dark mode (Andy, 2026-11-28)', () => {
	// The first fix lightened the fill to 78.5% with a near-black label, which
	// washed the purple out. The fill now moves only as far as white needs.
	const t = accentTokens(271, 91, true, 'graphite');
	assert.ok(t.lightness >= 60, `fill ${t.lightness}`);
	assert.ok(t.textLightness > 65, `text ${t.textLightness}`);
});

test('dark mode lightens the reporter\'s blue and violet text', () => {
	assert.ok(accentTokens(240, 91, true, 'zinc').textLightness > 65);
	assert.ok(accentTokens(271, 91, true, 'zinc').textLightness > 65);
});

test('the lightest dark shade needs the most lift', () => {
	const g = accentTokens(271, 91, true, 'graphite').textLightness;
	const z = accentTokens(271, 91, true, 'zinc').textLightness;
	assert.ok(g > z);
	// An unknown shade falls back to graphite.
	assert.equal(accentTokens(271, 91, true, 'nope' as never).textLightness, g);
});
