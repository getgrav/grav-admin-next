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
				const primary = toRgb(parse(t.primary));
				const where = `${hue}/${sat} ${dark ? shade : 'light'}`;
				for (const surface of surfaces) {
					const bg = toRgb(surface);
					assert.ok(contrastRatio(primary, bg) >= 4.5, `link ${where}`);
					assert.ok(contrastRatio(primary, tint(primary, bg)) >= 4.5, `active item ${where}`);
					assert.ok(contrastRatio(toRgb(parse(t.ring)), bg) >= 3, `ring ${where}`);
				}
				assert.ok(contrastRatio(toRgb(parse(t.primaryForeground)), primary) >= 4.5, `label ${where}`);
			}
		}
	}
});

test('an accent that already passes keeps its colour', () => {
	// The default Grav purple in light mode, and Emerald in dark mode.
	assert.deepEqual(accentTokens(271, 91, false), {
		lightness: 40,
		primary: 'hsl(271 91% 40%)',
		primaryForeground: 'hsl(0 0% 100%)',
		darkLabel: false,
		ring: 'hsl(271 91% 50%)',
	});
	assert.equal(accentTokens(160, 84, true, 'graphite').primary, 'hsl(160 84% 65%)');
});

test('light mode only ever darkens and keeps white labels', () => {
	for (let hue = 0; hue < 360; hue += 1) {
		const t = accentTokens(hue, 91, false);
		assert.ok(t.lightness <= 40);
		assert.equal(t.primaryForeground, 'hsl(0 0% 100%)');
	}
});

test('dark mode lightens the reporter\'s blue and violet', () => {
	assert.ok(accentTokens(240, 91, true, 'zinc').lightness > 65);
	assert.ok(accentTokens(271, 91, true, 'zinc').lightness > 65);
	// Green already reads as text at 65%, but white on it does not.
	const green = accentTokens(120, 91, true, 'zinc');
	assert.equal(green.primary, 'hsl(120 91% 65%)');
	assert.equal(green.primaryForeground, 'hsl(240 10% 3.9%)');
});

test('the lightest dark shade needs the most lift', () => {
	const g = accentTokens(271, 91, true, 'graphite').lightness;
	const z = accentTokens(271, 91, true, 'zinc').lightness;
	assert.ok(g > z);
	// An unknown shade falls back to graphite.
	assert.equal(accentTokens(271, 91, true, 'nope' as never).lightness, g);
});
