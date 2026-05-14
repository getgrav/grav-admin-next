#!/usr/bin/env node
/*
 * rtl-pairs codemod — Phase 2 of the RTL support rollout.
 *
 * Replaces physical Tailwind utilities (ml-*, mr-*, pl-*, pr-*, border-l,
 * border-r, text-left, text-right) with their Tailwind v4 direction-aware
 * logical equivalents (ms-*, me-*, ps-*, pe-*, border-s, border-e, text-start,
 * text-end). After this codemod runs, the same component renders correctly in
 * both LTR and RTL without per-class rtl: overrides.
 *
 * What this codemod does NOT touch (needs hand review):
 *   - Absolute positioning: left-*, right-* (semantics vary per component)
 *   - Transforms: -translate-x-* (need direction-aware sign flip)
 *   - Horizontal spacing collections: space-x-*, divide-x-* (Tailwind v4
 *     `space-x-reverse` story is awkward; prefer migrating to gap-*)
 *   - Inline `style="left: ...; right: ..."` (already converted by hand
 *     in the 5 shell hotspots)
 *
 * Files explicitly skipped here have already been hand-edited and contain
 * intentional mixes of physical + rtl: + logical that the codemod would
 * destabilise. Skip list is the same 5 shell hotspots from the Phase 2 plan.
 *
 * Usage:
 *   node scripts/rtl-pairs.mjs              # apply and write
 *   node scripts/rtl-pairs.mjs --dry-run    # report would-change without writing
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// Prefix-style replacements (utility ends with `-` and takes a value suffix).
const PREFIX_REPLACEMENTS = {
	'ml-': 'ms-',
	'mr-': 'me-',
	'pl-': 'ps-',
	'pr-': 'pe-',
};
// Exact-token replacements (the utility is a full identifier with no suffix).
const EXACT_REPLACEMENTS = {
	'border-l': 'border-s',
	'border-r': 'border-e',
	'text-left': 'text-start',
	'text-right': 'text-end',
};

const SKIP_FILES = new Set([
	'src/lib/components/AppShell.svelte',
	'src/lib/components/context-panels/ContextPanelHost.svelte',
	'src/lib/components/floating-widgets/FloatingWidgetLoader.svelte',
	'src/lib/components/pages/PageNavigator.svelte',
	'src/lib/components/ui/SegmentedToggle.svelte',
]);

const DRY_RUN = process.argv.includes('--dry-run');

/** Transform a single class token (e.g. `lg:ml-2` → `lg:ms-2`). */
function transformToken(token) {
	// Split off any variant chain (`hover:lg:ml-2` → variants `hover:lg:`, utility `ml-2`).
	const lastColon = token.lastIndexOf(':');
	const variantPrefix = lastColon >= 0 ? token.slice(0, lastColon + 1) : '';
	const utility = lastColon >= 0 ? token.slice(lastColon + 1) : token;

	// Strip a leading negative sign so it doesn't confuse the prefix match
	// (`-ml-2` → keep the `-`, replace `ml-2`).
	const negative = utility.startsWith('-') ? '-' : '';
	const base = negative ? utility.slice(1) : utility;

	if (EXACT_REPLACEMENTS[base]) {
		return variantPrefix + negative + EXACT_REPLACEMENTS[base];
	}
	for (const [from, to] of Object.entries(PREFIX_REPLACEMENTS)) {
		if (base.startsWith(from)) {
			return variantPrefix + negative + to + base.slice(from.length);
		}
	}
	return token;
}

/** Transform a whitespace-separated class string, preserving whitespace. */
function transformClassString(s) {
	return s
		.split(/(\s+)/)
		.map((part) => (/\s/.test(part) ? part : transformToken(part)))
		.join('');
}

/** Transform a Svelte file's source. Touches:
 *    class="..."        — full string transform
 *    class='...'        — full string transform
 *    class={`... ${x} ...`}  — transform only the string-literal parts of the
 *                              template, never the ${...} interpolations.
 * Other forms of class={expr} are left alone because we can't safely rewrite
 * an opaque expression's contents. */
function transformFile(source) {
	let out = source;

	out = out.replace(/(\bclass=)("[^"]*"|'[^']*')/g, (_, prefix, quoted) => {
		const quote = quoted[0];
		const inner = quoted.slice(1, -1);
		return prefix + quote + transformClassString(inner) + quote;
	});

	out = out.replace(/(\bclass=\{)([\s\S]*?)(\})/g, (m, openBrace, body, closeBrace) => {
		if (!body.includes('`')) return m;
		const newBody = body.replace(/`([^`]*)`/g, (_full, tlInner) => {
			const parts = tlInner.split(/(\$\{[^}]*\})/);
			const transformed = parts
				.map((p, i) => (i % 2 === 0 ? transformClassString(p) : p))
				.join('');
			return '`' + transformed + '`';
		});
		return openBrace + newBody + closeBrace;
	});

	return out;
}

async function walkSvelte(dir, out = []) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			await walkSvelte(full, out);
		} else if (e.isFile() && e.name.endsWith('.svelte')) {
			out.push(full);
		}
	}
	return out;
}

async function main() {
	const targets = ['src/lib', 'src/routes'].map((d) => resolve(ROOT, d));
	const files = (await Promise.all(targets.map((d) => walkSvelte(d)))).flat();

	let changedCount = 0;
	for (const path of files) {
		const rel = relative(ROOT, path);
		if (SKIP_FILES.has(rel)) continue;

		const src = await readFile(path, 'utf8');
		const out = transformFile(src);
		if (out !== src) {
			changedCount++;
			console.log(`${DRY_RUN ? 'would change' : 'changed'}: ${rel}`);
			if (!DRY_RUN) await writeFile(path, out);
		}
	}
	console.log(`\n${changedCount} file(s) ${DRY_RUN ? 'would be ' : ''}changed.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
