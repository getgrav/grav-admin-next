import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeadZone } from '../src/lib/components/editors/dead-zone.ts';

// Clicking anywhere in an editor box focuses the editor, not only clicking
// the text (admin2#61). This fix has regressed twice, so the rules and the
// wiring are both checked here.

class FakeEl {
	parent: FakeEl | null;
	cls: string;
	constructor(cls: string, parent: FakeEl | null = null) {
		this.cls = cls;
		this.parent = parent;
	}
	contains(other: FakeEl | null): boolean {
		for (let n = other; n; n = n.parent) if (n === this) return true;
		return false;
	}
	closest(selector: string): FakeEl | null {
		const cls = selector.replace(/^\./, '');
		for (let n: FakeEl | null = this; n; n = n.parent) if (n.cls.split(' ').includes(cls)) return n;
		return null;
	}
}

// box > .cm-editor > (.cm-scroller > (.cm-gutters, .cm-content > .cm-line), .cm-panels)
const box = new FakeEl('markdown-editor-cm');
const editor = new FakeEl('cm-editor', box);
const scroller = new FakeEl('cm-scroller', editor);
const gutters = new FakeEl('cm-gutters', scroller);
const gutterMarker = new FakeEl('cm-foldGutter', gutters);
const content = new FakeEl('cm-content', scroller);
const line = new FakeEl('cm-line', content);
const layer = new FakeEl('cm-layer cm-cursorLayer', scroller);
const panels = new FakeEl('cm-panels', editor);
const replaceInput = new FakeEl('cm-textfield', panels);
const tooltip = new FakeEl('cm-tooltip', editor);
const parts = { box, editor, scroller, content } as unknown as Parameters<typeof isDeadZone>[1];
const dead = (n: FakeEl | null) => isDeadZone(n as unknown as Node, parts);

test('empty parts of the box are dead zones that should focus the editor', () => {
	assert.equal(dead(box), true, 'the wrapper below a short document');
	assert.equal(dead(editor), true, 'the .cm-editor frame');
	assert.equal(dead(scroller), true, 'the scroller around the content');
	assert.equal(dead(layer), true, 'a cursor or selection layer');
});

test('CodeMirror keeps the clicks it handles itself', () => {
	assert.equal(dead(content), false);
	assert.equal(dead(line), false);
	assert.equal(dead(gutters), false, 'line numbers');
	assert.equal(dead(gutterMarker), false, 'fold markers');
});

test('panels and tooltips keep their own focus (grav-admin-next#24)', () => {
	assert.equal(dead(panels), false);
	assert.equal(dead(replaceInput), false);
	assert.equal(dead(tooltip), false);
	assert.equal(dead(null), false);
});

test('every CodeMirror editor component routes box clicks through focusOnDeadZoneClick', () => {
	const dir = join(import.meta.dirname, '../src/lib/components/editors');
	const editors = readdirSync(dir)
		.filter((f) => f.endsWith('.svelte'))
		.filter((f) => readFileSync(join(dir, f), 'utf8').includes('new EditorView('));
	assert.ok(editors.includes('MarkdownEditor.svelte') && editors.includes('CodeEditor.svelte'));
	for (const f of editors) {
		const src = readFileSync(join(dir, f), 'utf8');
		assert.match(src, /onmousedown=\{[^}]*\}/, `${f}: the editor box needs a mousedown handler`);
		assert.match(src, /focusOnDeadZoneClick\(/, `${f}: the mousedown handler must call focusOnDeadZoneClick()`);
	}
});
