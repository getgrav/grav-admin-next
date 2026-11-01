import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpCodeSpans } from '../src/lib/utils/help-code.ts';

// getgrav/grav-plugin-admin2#207: help written for admin-classic wraps names in
// backticks, and admin2 showed the backticks instead of code.

test('a code span becomes <code>', () => {
	assert.equal(helpCodeSpans('Absolute or relative URLs for `base_url`'), 'Absolute or relative URLs for <code>base_url</code>');
	assert.equal(helpCodeSpans('e.g. `01.about`, `001.about`'), 'e.g. <code>01.about</code>, <code>001.about</code>');
});

test('angle brackets inside a span stay text', () => {
	assert.equal(
		helpCodeSpans('Grav will look for `<template>.<extension>.twig` template'),
		'Grav will look for <code>&lt;template&gt;.&lt;extension&gt;.twig</code> template',
	);
	assert.equal(helpCodeSpans('becomes a `<caption>` element'), 'becomes a <code>&lt;caption&gt;</code> element');
});

test('entities inside a span are kept', () => {
	assert.equal(helpCodeSpans('an `Accept:&nbsp;text/markdown` header'), 'an <code>Accept:&nbsp;text/markdown</code> header');
});

test('existing HTML and other markdown-looking characters are left alone', () => {
	const html = 'Files larger than this return <code>false</code>. See <a href="https://x.test">docs</a>.';
	assert.equal(helpCodeSpans(html), html);
	assert.equal(helpCodeSpans('Supports wildcards (*) in values, Paddle > Developer tools, a_b_c'), 'Supports wildcards (*) in values, Paddle > Developer tools, a_b_c');
	assert.equal(helpCodeSpans('The part in *stars* is drawn in the accent.'), 'The part in *stars* is drawn in the accent.');
});

test('backticks inside a tag are not touched, and a lone backtick stays', () => {
	assert.equal(helpCodeSpans('<span title="`x`">y</span> and `z`'), '<span title="`x`">y</span> and <code>z</code>');
	assert.equal(helpCodeSpans('a lone ` backtick'), 'a lone ` backtick');
});
