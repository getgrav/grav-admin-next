import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';
import noUnsanitizedHtml from './eslint-rules/no-unsanitized-html.js';

/**
 * The `{@html …}` guard on its own, so it can gate CI today.
 *
 * The main config carries the same rule, but `npm run lint` also reports a long
 * tail of pre-existing findings, so a failing exit code there says nothing. This
 * config runs one rule and nothing else: a non-zero exit means someone added an
 * unsanitized HTML sink.
 */
export default defineConfig(
	includeIgnoreFile(path.resolve(import.meta.dirname, '.gitignore')),
	// Brings in the Svelte parser and nothing we care to enforce here; every
	// eslint-plugin-svelte rule it switches on is turned back off below.
	svelte.configs.base,
	{
		files: ['**/*.svelte'],
		plugins: { grav: { rules: { 'no-unsanitized-html': noUnsanitizedHtml } } },
		languageOptions: {
			parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'], svelteConfig }
		},
		rules: { 'grav/no-unsanitized-html': 'error' }
	}
);
