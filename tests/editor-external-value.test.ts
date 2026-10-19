import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { EditorState, type TransactionSpec } from '@codemirror/state';

// getgrav/grav-plugin-admin2#198: a markdown (or YAML) editor kept showing its
// old text when the flex edit screen refilled the form in place. The sync effect
// read `value` only behind a check on the view, a plain variable created after
// the effect's first run, so the effect never depended on `value`.
//
// The helper uses runes, so it is compiled here with Svelte's own compiler and
// run on the client runtime (effects don't need a DOM).

const require = createRequire(import.meta.url);
const svelteDir = require.resolve('svelte/package.json').replace(/package\.json$/, '');
const specifiers: Record<string, string> = {
	svelte: pathToFileURL(svelteDir + 'src/index-client.js').href,
	'svelte/internal/client': pathToFileURL(svelteDir + 'src/internal/client/index.js').href,
	'svelte/internal/flags/legacy': pathToFileURL(svelteDir + 'src/internal/flags/legacy.js').href,
	'@codemirror/state': pathToFileURL(require.resolve('@codemirror/state')).href,
};

// Compile a runes module to client JS and import it, pointing its bare imports
// at files (a data: URL can't resolve them itself). Vite strips the types of a
// .svelte.ts file before Svelte sees it; Node's stripper does that here.
function compile(source: string, filename: string, extra: Record<string, string> = {}): string {
	let { code } = compileModule(stripTypeScriptTypes(source), { filename, generate: 'client' }).js;
	for (const [from, to] of Object.entries({ ...specifiers, ...extra })) {
		code = code.replaceAll(`'${from}'`, `'${to}'`);
	}
	return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
}

const helperFile = new URL('../src/lib/components/editors/external-value.svelte.ts', import.meta.url);
const helperUrl = compile(readFileSync(helperFile, 'utf8'), helperFile.pathname);
type Helper = typeof import('../src/lib/components/editors/external-value.svelte.ts');
const helper = (await import(helperUrl)) as Helper;

// A stand-in for EditorView: a real EditorState, so the change spec and the
// annotation go through CodeMirror itself.
function fakeView(doc: string) {
	let state = EditorState.create({ doc });
	const transactions: ReturnType<EditorState['update']>[] = [];
	return {
		get state() { return state; },
		dispatch(spec: TransactionSpec) {
			const tr = state.update(spec);
			transactions.push(tr);
			state = tr.state;
		},
		transactions,
	};
}
type FakeView = ReturnType<typeof fakeView>;

// The component's side: `value` is a prop (reactive), the view a plain variable
// set once the editor has been created, after the first effect run.
interface Harness {
	setValue(v: string | null | undefined): void;
	setView(v: FakeView): void;
	setPaused(p: boolean): void;
	destroy(): void;
}
const { mount } = (await import(compile(`
	import { flushSync } from 'svelte';
	import { syncExternalValue } from 'HELPER';
	export function mount(initial) {
		let value = $state(initial);
		let paused = $state(false);
		let view;
		const destroy = $effect.root(() => {
			syncExternalValue(() => value, () => view, () => paused);
		});
		flushSync();
		return {
			setValue(v) { value = v; flushSync(); },
			setView(v) { view = v; },
			setPaused(p) { paused = p; flushSync(); },
			destroy,
		};
	}
`, 'harness.svelte.js', { HELPER: helperUrl }))) as { mount(initial: string): Harness };

test('a value changed after the editor was created reaches the editor', () => {
	const h = mount('');
	const view = fakeView(''); // created from the value at mount time, like onMount does
	h.setView(view);
	h.setValue('Filled in by the server');
	assert.equal(view.state.doc.toString(), 'Filled in by the server');
	h.destroy();
});

test('the replacement is marked so the update listener does not report it back', () => {
	const h = mount('old');
	const view = fakeView('old');
	h.setView(view);
	h.setValue('new');
	assert.equal(view.transactions.length, 1);
	assert.equal(view.transactions[0].annotation(helper.externalValue), true);
	h.destroy();
});

test('a null value empties the editor', () => {
	const h = mount('text');
	const view = fakeView('text');
	h.setView(view);
	h.setValue(null);
	assert.equal(view.state.doc.toString(), '');
	h.destroy();
});

test('the value the editor already shows (its own echo) dispatches nothing', () => {
	const h = mount('a');
	const view = fakeView('a');
	h.setView(view);
	view.dispatch({ changes: { from: 1, insert: 'b' } }); // the user types
	h.setValue('ab'); // the parent stores what onchange reported
	assert.equal(view.transactions.length, 1);
	h.destroy();
});

test('nothing is dispatched while paused (collaborative editing owns the document)', () => {
	const h = mount('x');
	const view = fakeView('x');
	h.setView(view);
	h.setPaused(true);
	h.setValue('y');
	assert.equal(view.state.doc.toString(), 'x');
	assert.equal(view.transactions.length, 0);
	h.destroy();
});

test('only the changed part is replaced, so a cursor before it stays put', () => {
	assert.equal(helper.replaceChange('same', 'same'), null);
	assert.deepEqual(helper.replaceChange('Hello world', 'Hello there world'), { from: 6, to: 6, insert: 'there ' });
	assert.deepEqual(helper.replaceChange('abc', ''), { from: 0, to: 3, insert: '' });
	assert.deepEqual(helper.replaceChange('', 'abc'), { from: 0, to: 0, insert: 'abc' });
	assert.deepEqual(helper.replaceChange('aaa', 'aa'), { from: 2, to: 3, insert: '' });
	const view = fakeView('# Title\n\nold body\n\nfooter');
	view.dispatch({ selection: { anchor: 3 } });
	view.dispatch({ changes: helper.replaceChange(view.state.doc.toString(), '# Title\n\nnew body text\n\nfooter')! });
	assert.equal(view.state.doc.toString(), '# Title\n\nnew body text\n\nfooter');
	assert.equal(view.state.selection.main.head, 3);
});
