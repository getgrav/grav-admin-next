import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';

// getgrav/grav-plugin-admin2#224: in admin-classic a click anywhere on a
// toggleable field's label flipped its on/off checkbox (`<label for=
// "toggleable_…">`). Admin2 drew the label as a plain <span>, so only the box
// itself responded, and the box had no accessible name.
//
// Run: node --test tests/toggleable-label.test.ts

const require = createRequire(import.meta.url);
const svelteDir = require.resolve('svelte/package.json').replace(/package\.json$/, '');
const root = new URL('../src/lib/components/blueprint/', import.meta.url);

// Server-render ToggleableCheckbox, so the test checks the real markup.
async function renderToggle(props: Record<string, unknown>): Promise<string> {
	const readonlyUrl = 'data:text/javascript;base64,' + Buffer.from('export function formReadonly() { return () => false; }').toString('base64');
	let { code } = compile(readFileSync(new URL('ToggleableCheckbox.svelte', root), 'utf8'), {
		filename: 'ToggleableCheckbox.svelte',
		generate: 'server',
	}).js;
	code = code
		.replaceAll(`'svelte/internal/server'`, `'${pathToFileURL(svelteDir + 'src/internal/server/index.js').href}'`)
		.replaceAll(`'./readonly'`, `'${readonlyUrl}'`);
	const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
	const { render } = await import(pathToFileURL(svelteDir + 'src/server/index.js').href);
	return render(component, { props }).body;
}

test('the toggle button takes the id the label points at', async () => {
	const html = await renderToggle({ toggled: false, onToggle: () => {}, id: 'f1-toggle' });
	assert.match(html, /<button[^>]*\bid="f1-toggle"/);
});

test('without an id the toggle button carries none', async () => {
	const html = await renderToggle({ toggled: true, onToggle: () => {} });
	assert.doesNotMatch(html, /<button[^>]*\bid=/);
});

// Both places that draw a toggleable field's label column point the label at
// the toggle: FieldRenderer (fields nested in columns or lists) and
// SectionField (a section's direct children).
const renderer = readFileSync(new URL('FieldRenderer.svelte', root), 'utf8');
const section = readFileSync(new URL('fields/SectionField.svelte', root), 'utf8');

test('FieldRenderer labels a toggleable field with its toggle', () => {
	assert.match(renderer, /<ToggleableCheckbox id=\{toggleId\}/);
	assert.match(renderer, /const labelTargetId = \$derived\(toggleId \?\? columnControlId\)/);
	assert.match(renderer, /<FieldLabel \{field\} \{toggled\} \{filter\} controlId=\{labelTargetId\} \/>/);
});

test('SectionField labels a toggleable field with its toggle', () => {
	assert.match(section, /<ToggleableCheckbox id=\{toggleId\}/);
	assert.match(section, /<FieldLabel field=\{childField\} \{toggled\} \{filter\} controlId=\{toggleId \?\? controlId\} \/>/);
});
