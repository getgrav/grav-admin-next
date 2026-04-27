#!/usr/bin/env node
/**
 * i18n-strings — find hardcoded English UI strings in admin-next that should
 * be translation keys.
 *
 * Walks .svelte and .ts files, applies heuristics to spot:
 *   - text nodes between tags ({i18n.t(...)} expressions are skipped)
 *   - placeholder= aria-label= title= alt= attribute string literals
 *   - toast.success / toast.error / toast / sonner with string literal first arg
 *
 * Heuristics filter out CSS classes, HTML tag/attr names, dev-only console
 * messages, file paths, single-character symbols, and obvious technical
 * tokens.
 *
 * Usage:
 *   node scripts/i18n-strings.mjs              # full report
 *   node scripts/i18n-strings.mjs --json       # machine-readable
 *   node scripts/i18n-strings.mjs --dir lib/components  # scope
 *   node scripts/i18n-strings.mjs --max 100    # cap output
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const dirIdx = args.indexOf('--dir');
const SCOPE = dirIdx >= 0 ? join(SRC_DIR, args[dirIdx + 1]) : SRC_DIR;
const maxIdx = args.indexOf('--max');
const MAX_PER_FILE = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : Infinity;

// --- File walk ---

// Directories whose contents are dev-only and not user-facing.
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'testing']);

function* walk(dir, exts) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		const st = statSync(path);
		if (st.isDirectory()) {
			if (SKIP_DIRS.has(entry)) continue;
			yield* walk(path, exts);
		} else if (exts.some((e) => entry.endsWith(e))) {
			yield path;
		}
	}
}

// --- Heuristics ---

// Looks like a real UI string: at least one letter, reasonable length, contains
// either a space or an actual sentence-ish structure, and doesn't match common
// non-UI patterns.
function looksLikeUiString(s) {
	if (!s || typeof s !== 'string') return false;
	const t = s.trim();
	if (t.length < 3) return false;
	if (t.length > 300) return false;
	if (!/[a-zA-Z]/.test(t)) return false;

	// Too few real letters relative to length (likely a code identifier or path)
	const letterCount = (t.match(/[a-zA-Z]/g) || []).length;
	if (letterCount / t.length < 0.4) return false;

	// File path / URL
	if (/^[a-z]+:\/\//.test(t)) return false;
	if (/^\/?[\w-]+\/[\w./-]+$/.test(t) && !/\s/.test(t)) return false;

	// CSS class soup (lots of hyphens, no spaces, dashes between letters)
	if (!/\s/.test(t) && /^[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)*$/.test(t) && /-/.test(t)) return false;

	// HTML tag or attribute name (single token, lowercase)
	if (/^[a-z][a-zA-Z0-9-]*$/.test(t) && t.length < 25) return false;

	// camelCase identifier
	if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;
	if (/^[A-Z][a-zA-Z0-9]*$/.test(t) && t.length < 6) return false;

	// SCREAMING_SNAKE_CASE — likely a translation key already missed
	if (/^[A-Z][A-Z0-9_]*$/.test(t)) return false;

	// Translation key shape (PLUGIN_X.Y.Z) — already a key
	if (/^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_.]*$/.test(t)) return false;

	// Numbers, dates, hex colours, units
	if (/^[#$]?[0-9.,%-]+(?:\s*\w{1,3})?$/.test(t)) return false;

	// Single non-letter symbols
	if (/^[^a-zA-Z]+$/.test(t)) return false;

	return true;
}

// --- Scanners ---

const findings = []; // { path, line, kind, text }

function pushFinding(path, line, kind, text) {
	findings.push({ path: path.slice(REPO_ROOT.length + 1), line, kind, text });
}

function lineOf(src, idx) {
	let line = 1;
	for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) line++;
	return line;
}

// Scan attribute literals: placeholder="..." aria-label="..." title="..." alt="..."
const ATTR_RE = /\b(placeholder|aria-label|title|alt|aria-description)\s*=\s*(['"])([^'"]+?)\2/g;

// Scan toast / sonner string-literal first arg: toast.success('...'), toast.error("..."), toast('...')
const TOAST_RE = /\b(?:toast(?:\.\w+)?)\s*\(\s*(['"])([^'"]+?)\1/g;

// Skip lines that are inside HTML comments or have certain patterns
function shouldSkipLine(line) {
	const trimmed = line.trim();
	if (trimmed.startsWith('//')) return true;
	if (trimmed.startsWith('*')) return true;
	if (trimmed.startsWith('console.')) return true;
	return false;
}

// Match Svelte/HTML text nodes between tags. A naive but effective approach:
// for each line, find `>TEXT<` patterns where TEXT looks like UI string.
// Avoids quote-delimited content (attribute values).
const TEXT_NODE_RE = />([^<>{}]+?)</g;

function scanFile(path) {
	const src = readFileSync(path, 'utf8');
	const isSvelte = path.endsWith('.svelte');
	let count = 0;

	// Attribute literals (in both .svelte and .ts/tsx)
	ATTR_RE.lastIndex = 0;
	let m;
	while ((m = ATTR_RE.exec(src)) !== null) {
		const text = m[3];
		if (looksLikeUiString(text)) {
			pushFinding(path, lineOf(src, m.index), `@${m[1]}`, text);
			count++;
		}
		if (count >= MAX_PER_FILE) return;
	}

	// Toast literal args
	TOAST_RE.lastIndex = 0;
	while ((m = TOAST_RE.exec(src)) !== null) {
		const text = m[2];
		if (looksLikeUiString(text)) {
			pushFinding(path, lineOf(src, m.index), 'toast', text);
			count++;
		}
		if (count >= MAX_PER_FILE) return;
	}

	// Svelte text nodes — only for .svelte files
	if (isSvelte) {
		// Mask out script and style blocks so we don't scan code
		const masked = src
			.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (m2) => ' '.repeat(m2.length))
			.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (m2) => ' '.repeat(m2.length))
			// Mask out Svelte expressions {...} so their contents don't get scanned
			.replace(/\{[^}]*\}/g, (m2) => ' '.repeat(m2.length))
			// Mask HTML comments
			.replace(/<!--[\s\S]*?-->/g, (m2) => ' '.repeat(m2.length));

		TEXT_NODE_RE.lastIndex = 0;
		while ((m = TEXT_NODE_RE.exec(masked)) !== null) {
			const text = m[1].trim();
			if (looksLikeUiString(text)) {
				pushFinding(path, lineOf(src, m.index), 'text', text);
				count++;
			}
			if (count >= MAX_PER_FILE) return;
		}
	}
}

// --- Main ---

for (const path of walk(SCOPE, ['.svelte', '.ts'])) {
	scanFile(path);
}

// Group by file for reporting
const byFile = new Map();
for (const f of findings) {
	if (!byFile.has(f.path)) byFile.set(f.path, []);
	byFile.get(f.path).push(f);
}

if (FLAG_JSON) {
	console.log(JSON.stringify({ total: findings.length, files: Object.fromEntries(byFile) }, null, 2));
	process.exit(0);
}

console.log('=== i18n hardcoded-string scan ===');
console.log(`Scope: ${SCOPE.slice(REPO_ROOT.length + 1) || '.'}`);
console.log(`Total findings: ${findings.length} across ${byFile.size} files`);
console.log('');

// Sort files by finding count descending
const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [file, items] of sortedFiles) {
	console.log(`${file}  (${items.length})`);
	for (const item of items) {
		const kindTag = item.kind.padEnd(10);
		const truncated = item.text.length > 90 ? item.text.slice(0, 87) + '...' : item.text;
		console.log(`  ${String(item.line).padStart(4)}  ${kindTag}  "${truncated}"`);
	}
	console.log('');
}
