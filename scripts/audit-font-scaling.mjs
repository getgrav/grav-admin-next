#!/usr/bin/env node
/**
 * audit-font-scaling — find sources of text/icon sizing that don't scale
 * with the Font Size preference.
 *
 * Admin Next's Font Size preference works by setting `--app-font-size` on
 * <html>, which means anything sized in `rem` scales. Anything sized in
 * literal `px` does not. This audit finds those non-scaling sources so we
 * can convert them.
 *
 * Categories:
 *   tw     Tailwind arbitrary px classes        — `text-[13px]`
 *   css    Raw font-size in <style> / .css       — `font-size: 13px`
 *   inline Inline style font-size in JS strings  — `style="font-size:13px"`
 *   icon   Lucide-style hardcoded size props     — `<Pencil size={14} />`
 *
 * Usage:
 *   node scripts/audit-font-scaling.mjs                # full report, ranked by file
 *   node scripts/audit-font-scaling.mjs --only tw      # filter to one category
 *   node scripts/audit-font-scaling.mjs --files        # files-only summary
 *   node scripts/audit-font-scaling.mjs --json         # JSON for CI / scripting
 *   node scripts/audit-font-scaling.mjs --ci           # exit 1 if any hits
 *   node scripts/audit-font-scaling.mjs --fix tw       # bulk-rewrite text-[Npx] -> text-[Nrem]
 *
 * Fixing:
 *   Only the `tw` category is auto-fixable. Each `text-[Npx]` is rewritten
 *   to `text-[(N/16)rem]`, preserving the visual size while letting the Font
 *   Size preference scale it. Pass `--fix tw --dry` to preview, or restrict
 *   to specific files with `--fix tw --path <glob-substring>`.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC_ROOT = resolve(REPO_ROOT, 'src');

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_FILES = args.includes('--files');
const FLAG_CI = args.includes('--ci');
const FLAG_DRY = args.includes('--dry');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const fixIdx = args.indexOf('--fix');
const FIX = fixIdx >= 0 ? args[fixIdx + 1] : null;
const pathIdx = args.indexOf('--path');
const PATH_FILTER = pathIdx >= 0 ? args[pathIdx + 1] : null;

const CATEGORIES = ['tw', 'css', 'inline', 'icon'];
if (ONLY && !CATEGORIES.includes(ONLY)) {
	console.error(`--only must be one of: ${CATEGORIES.join(', ')}`);
	process.exit(2);
}
if (FIX && FIX !== 'tw') {
	console.error(`--fix currently only supports 'tw' (the other categories need human judgment).`);
	process.exit(2);
}

const EXTS = ['.svelte', '.ts', '.tsx', '.js', '.css'];
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'dist', '.git']);
// Skip self so the regex literals in this file don't match.
const SKIP_FILES = new Set([resolve(__dirname, 'audit-font-scaling.mjs')]);

// ── matchers ──────────────────────────────────────────────────────────────
// tw: `text-[13px]` (Tailwind arbitrary px). Negative lookbehind to ignore
//     leading-text matches inside identifier-ish strings is unnecessary —
//     this pattern is distinctive enough.
const RE_TW = /text-\[(\d+)px\]/g;

// css: `font-size: 13px` or `font-size:13px` (with optional !important).
//      Excludes the var() default `var(--app-font-size, 16px)` which is
//      intentional and lives in layout.css.
const RE_CSS = /font-size\s*:\s*(\d+)px/g;
const CSS_ALLOWED_SUBSTR = '--app-font-size';

// inline: `font-size:13px` or `font-size: 13px` appearing inside a JS string
//         literal (single, double, or template). We just match the substring;
//         the css matcher above also catches these, so we dedupe by line.
const RE_INLINE = /font-size\s*:\s*(\d+)px/g;

// icon: `<Pencil size={14}` or `<Pencil size="14"`. Lucide icons + similar.
//       We restrict the tag to PascalCase so we don't catch `<img size=…>`.
const RE_ICON = /<([A-Z][A-Za-z0-9]*)[^>]*\bsize=\{?["']?(\d+)["']?\}?/g;

// ── walk ──────────────────────────────────────────────────────────────────
function walk(dir, out) {
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIRS.has(entry)) continue;
		const p = join(dir, entry);
		let st;
		try { st = statSync(p); } catch { continue; }
		if (st.isDirectory()) {
			walk(p, out);
		} else if (EXTS.some(e => entry.endsWith(e)) && !SKIP_FILES.has(p)) {
			out.push(p);
		}
	}
	return out;
}

function lineOf(text, idx) {
	let line = 1;
	for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) line++;
	return line;
}

function snippetFor(text, idx) {
	const start = text.lastIndexOf('\n', idx) + 1;
	let end = text.indexOf('\n', idx);
	if (end === -1) end = text.length;
	return text.slice(start, end).trim().slice(0, 160);
}

function findAll(text, re, cat, filePath) {
	const hits = [];
	re.lastIndex = 0;
	let m;
	while ((m = re.exec(text)) !== null) {
		const idx = m.index;
		const snippet = snippetFor(text, idx);
		if (cat === 'css' && snippet.includes(CSS_ALLOWED_SUBSTR)) continue;
		hits.push({
			file: filePath,
			line: lineOf(text, idx),
			cat,
			px: Number(m[m.length === 3 ? 2 : 1]),
			snippet,
		});
	}
	return hits;
}

function pxToRemLiteral(px) {
	const rem = px / 16;
	// Trim trailing zeros: 0.8125 stays, 1.0 -> 1, 0.875 stays.
	const s = Number.isInteger(rem) ? String(rem) : String(rem);
	return `${s}rem`;
}

// ── fix mode ──────────────────────────────────────────────────────────────
if (FIX === 'tw') {
	const files = walk(SRC_ROOT, []).filter(f => !PATH_FILTER || f.includes(PATH_FILTER));
	let totalSubs = 0;
	let filesTouched = 0;
	const perFile = [];
	for (const file of files) {
		const original = readFileSync(file, 'utf8');
		let subs = 0;
		const updated = original.replace(/text-\[(\d+)px\]/g, (_m, n) => {
			subs++;
			return `text-[${pxToRemLiteral(Number(n))}]`;
		});
		if (subs > 0) {
			totalSubs += subs;
			filesTouched++;
			perFile.push({ file: relative(REPO_ROOT, file), subs });
			if (!FLAG_DRY) writeFileSync(file, updated);
		}
	}
	perFile.sort((a, b) => b.subs - a.subs);
	for (const { file, subs } of perFile) {
		console.log(`${String(subs).padStart(4)}  ${file}`);
	}
	const verb = FLAG_DRY ? 'would rewrite' : 'rewrote';
	console.log(`\n${verb} ${totalSubs} occurrences across ${filesTouched} files${FLAG_DRY ? ' (--dry — no files written)' : ''}`);
	process.exit(0);
}

// ── scan ──────────────────────────────────────────────────────────────────
const files = walk(SRC_ROOT, []);
const allHits = [];

for (const file of files) {
	const text = readFileSync(file, 'utf8');
	const rel = relative(REPO_ROOT, file);
	const isCss = file.endsWith('.css');

	if (!ONLY || ONLY === 'tw') {
		// `text-[Npx]` only makes sense in template files, but it's harmless to
		// scan everywhere — pattern is distinctive.
		allHits.push(...findAll(text, RE_TW, 'tw', rel));
	}

	if (!ONLY || ONLY === 'css') {
		// Match CSS / <style> blocks. To keep the matcher simple we just search
		// the whole file; svelte files are fine because `font-size:` only
		// realistically appears in <style> or inline-style strings.
		const cssHits = findAll(text, RE_CSS, 'css', rel);
		// In .svelte/.ts we also want the inline-string sub-report, but since
		// they reuse the same regex/line we'll dedupe by line below.
		allHits.push(...cssHits);
	}

	if (!ONLY || ONLY === 'inline') {
		// Only for non-css files. Dedupe vs. the css scan by line.
		if (!isCss) {
			const seen = new Set(allHits.filter(h => h.file === rel && h.cat === 'css').map(h => h.line));
			const inlineHits = findAll(text, RE_INLINE, 'inline', rel)
				.filter(h => !seen.has(h.line));
			allHits.push(...inlineHits);
		}
	}

	if (!ONLY || ONLY === 'icon') {
		if (file.endsWith('.svelte')) {
			allHits.push(...findAll(text, RE_ICON, 'icon', rel));
		}
	}
}

// ── output ────────────────────────────────────────────────────────────────
const byFile = new Map();
for (const h of allHits) {
	if (!byFile.has(h.file)) byFile.set(h.file, []);
	byFile.get(h.file).push(h);
}

const ranked = [...byFile.entries()]
	.map(([file, hits]) => ({ file, hits, count: hits.length }))
	.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

if (FLAG_JSON) {
	console.log(JSON.stringify({
		total: allHits.length,
		files: ranked.length,
		byCategory: CATEGORIES.reduce((acc, c) => {
			acc[c] = allHits.filter(h => h.cat === c).length;
			return acc;
		}, {}),
		ranked: ranked.map(r => ({
			file: r.file,
			count: r.count,
			hits: r.hits.map(h => ({ line: h.line, cat: h.cat, px: h.px, snippet: h.snippet })),
		})),
	}, null, 2));
} else if (FLAG_FILES) {
	for (const { file, count } of ranked) {
		console.log(`${String(count).padStart(4)}  ${file}`);
	}
	console.log(`\n${allHits.length} hits across ${ranked.length} files`);
} else {
	for (const { file, hits } of ranked) {
		console.log(`\n${file}  (${hits.length})`);
		for (const h of hits) {
			console.log(`  ${String(h.line).padStart(4)}  [${h.cat}] ${h.snippet}`);
		}
	}
	const summary = CATEGORIES
		.map(c => `${c}=${allHits.filter(h => h.cat === c).length}`)
		.join('  ');
	console.log(`\nTotal: ${allHits.length} hits across ${ranked.length} files  (${summary})`);
}

if (FLAG_CI && allHits.length > 0) process.exit(1);
