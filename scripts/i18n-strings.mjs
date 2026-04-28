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
 *
 * Fix mode (one-shot rewrite from a vetted approval plan):
 *   node scripts/i18n-strings.mjs --fix --plan=path/to/approvals.json
 *
 * Approval plan is a JSON array of { path, line, kind, text, key } entries.
 * `path` is repo-relative (e.g. "src/lib/components/X.svelte"). `kind` is
 * one of "text", "@placeholder", "@aria-label", "@title", "@alt",
 * "@aria-description", or "toast". `text` must match the original literal
 * exactly. `key` is a fully-qualified ICU key without the "ICU." prefix
 * (e.g. "ADMIN_NEXT.PAGES.NEW_PAGE_TITLE").
 *
 * Outputs:
 *   - in-place edits to source files (with i18n import injection where missing)
 *   - new ICU.* entries merged directly into ../grav-plugin-admin2/languages/en.yaml.
 *     Existing keys are never overwritten — the script reports a conflict instead
 *     so a hand-tuned value (placeholders, plurals) isn't silently clobbered.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const ADMIN2_LANG_PATH = resolve(REPO_ROOT, '..', 'grav-plugin-admin2', 'languages', 'en.yaml');
const ADMIN2_LANG_REL = '../grav-plugin-admin2/languages/en.yaml';

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_FIX = args.includes('--fix');
const planIdx = args.findIndex((a) => a === '--plan' || a.startsWith('--plan='));
const FLAG_PLAN = planIdx >= 0
	? (args[planIdx].startsWith('--plan=') ? args[planIdx].slice('--plan='.length) : args[planIdx + 1])
	: null;
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

// --- Fix mode (apply a vetted approval plan) ---

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(kind, text) {
	const t = escapeRegex(text);
	if (kind === 'text') {
		// `>WS TEXT WS<` — preserve surrounding whitespace
		return new RegExp(`(>)(\\s*)(${t})(\\s*)(<)`);
	}
	if (kind.startsWith('@')) {
		const attr = escapeRegex(kind.slice(1));
		return new RegExp(`\\b(${attr})\\s*=\\s*(['"])(${t})\\2`);
	}
	if (kind === 'toast') {
		// captures `toast.x(  '...'` — leaves the closing `)` and any trailing args alone
		return new RegExp(`(toast(?:\\.\\w+)?)\\s*\\(\\s*(['"])(${t})\\2`);
	}
	return null;
}

function buildReplacement(kind, key, m) {
	if (kind === 'text') {
		return `${m[1]}${m[2]}{i18n.t('${key}')}${m[4]}${m[5]}`;
	}
	if (kind.startsWith('@')) {
		return `${m[1]}={i18n.t('${key}')}`;
	}
	if (kind === 'toast') {
		return `${m[1]}(i18n.t('${key}')`;
	}
	return null;
}

function hasI18nImport(src) {
	return /import\s*\{[^}]*\bi18n\b[^}]*\}\s*from\s*['"][^'"]*\$lib\/stores\/i18n\.svelte['"]/.test(src);
}

function injectImport(src, isSvelte) {
	const importLine = `import { i18n } from '$lib/stores/i18n.svelte';`;
	if (isSvelte) {
		// Insert at start of first <script> block
		const m = src.match(/<script\b[^>]*>\s*\n/);
		if (m) {
			const idx = m.index + m[0].length;
			return src.slice(0, idx) + `\t${importLine}\n` + src.slice(idx);
		}
		// No script block — prepend one
		return `<script lang="ts">\n\t${importLine}\n</script>\n\n` + src;
	}
	// .ts file: insert after the last existing top-level import, or at top
	const importMatches = [...src.matchAll(/^import\b[^;]*;[^\n]*\n/gm)];
	if (importMatches.length > 0) {
		const last = importMatches[importMatches.length - 1];
		const idx = last.index + last[0].length;
		return src.slice(0, idx) + `${importLine}\n` + src.slice(idx);
	}
	return `${importLine}\n` + src;
}

function setNested(obj, segments, value) {
	let cur = obj;
	for (let i = 0; i < segments.length - 1; i++) {
		const k = segments[i];
		if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
		cur = cur[k];
	}
	cur[segments[segments.length - 1]] = value;
}

/**
 * Merge new ICU.* entries into admin2's en.yaml in place.
 *
 * - Preserves the leading comment header (everything before the first
 *   non-comment, non-blank line).
 * - Walks the additions tree leaf-by-leaf. If the same key path already
 *   exists with a different value, records a conflict and leaves the
 *   existing value untouched (hand-tuned ICU placeholders / plurals
 *   shouldn't be silently overwritten by an auto-extracted English
 *   literal).
 * - YAML re-emit uses two-space indent, double-quoted scalars, no line
 *   wrap — same shape js-yaml produced for languages-additions.yaml.
 */
function mergeIntoAdmin2Lang(additions) {
	const raw = readFileSync(ADMIN2_LANG_PATH, 'utf8');

	// Capture leading header: contiguous run of `#` lines (and blank lines)
	// from the top, stopping at the first line that looks like YAML content.
	const lines = raw.split('\n');
	let headerEnd = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith('#') || line.trim() === '') {
			headerEnd = i + 1;
		} else {
			break;
		}
	}
	const header = lines.slice(0, headerEnd).join('\n');
	const body = lines.slice(headerEnd).join('\n');

	const existing = yaml.load(body) ?? {};
	const conflicts = [];
	let added = 0;

	function merge(target, source, pathSegs) {
		for (const [key, value] of Object.entries(source)) {
			const segs = [...pathSegs, key];
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				if (target[key] === undefined) target[key] = {};
				if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) {
					conflicts.push({ key: segs.join('.'), existing: target[key], proposed: value });
					continue;
				}
				merge(target[key], value, segs);
			} else if (target[key] === undefined) {
				target[key] = value;
				added++;
			} else if (target[key] !== value) {
				conflicts.push({ key: segs.join('.'), existing: target[key], proposed: value });
			}
		}
	}
	merge(existing, additions, []);

	const dumped = yaml.dump(existing, {
		indent: 2,
		quotingType: '"',
		forceQuotes: true,
		lineWidth: -1,
	});

	const out = (header.endsWith('\n') ? header : header + '\n') + dumped;
	writeFileSync(ADMIN2_LANG_PATH, out);

	return { added, conflicts };
}

if (FLAG_FIX) {
	if (!FLAG_PLAN) {
		console.error('Error: --fix requires --plan=path/to/approvals.json');
		process.exit(2);
	}
	const planPath = resolve(FLAG_PLAN);
	const plan = JSON.parse(readFileSync(planPath, 'utf8'));
	if (!Array.isArray(plan)) {
		console.error('Error: plan file must be a JSON array of entries');
		process.exit(2);
	}

	// Group by path
	const byPath = new Map();
	for (const entry of plan) {
		if (!entry.path || !entry.kind || !entry.text || !entry.key) {
			console.error(`Skipping malformed entry: ${JSON.stringify(entry)}`);
			continue;
		}
		if (!byPath.has(entry.path)) byPath.set(entry.path, []);
		byPath.get(entry.path).push(entry);
	}

	// Build YAML additions tree (only ICU.* keys appended; assumes plan keys lack the ICU. prefix)
	const additions = {};
	let appliedCount = 0;
	let skippedCount = 0;
	const failures = [];

	for (const [relPath, entries] of byPath) {
		const absPath = resolve(REPO_ROOT, relPath);
		let src = readFileSync(absPath, 'utf8');
		const isSvelte = absPath.endsWith('.svelte');

		// Collect all replacement positions, then apply end-to-start
		const ops = [];
		for (const entry of entries) {
			const re = buildPattern(entry.kind, entry.text);
			if (!re) {
				failures.push({ ...entry, reason: `unknown kind ${entry.kind}` });
				continue;
			}
			// Find all matches; pick the one whose line matches `entry.line`
			const reG = new RegExp(re.source, 'g');
			let m;
			let chosen = null;
			while ((m = reG.exec(src)) !== null) {
				const ln = lineOf(src, m.index);
				if (Math.abs(ln - entry.line) <= 1) {
					chosen = m;
					break;
				}
				if (!chosen) chosen = m; // fallback to first match if none line-matches
			}
			if (!chosen) {
				failures.push({ ...entry, reason: 'no pattern match in file' });
				continue;
			}
			const replacement = buildReplacement(entry.kind, entry.key, chosen);
			ops.push({ start: chosen.index, end: chosen.index + chosen[0].length, replacement });

			// Add to YAML additions under ICU.<key> (use entry.value if set so HTML entities decode)
			setNested(additions, ['ICU', ...entry.key.split('.')], entry.value ?? entry.text);
		}

		if (ops.length === 0) continue;

		// Apply end-to-start so earlier offsets stay valid
		ops.sort((a, b) => b.start - a.start);
		for (const op of ops) {
			src = src.slice(0, op.start) + op.replacement + src.slice(op.end);
			appliedCount++;
		}

		// Inject import if needed
		if (!hasI18nImport(src)) {
			src = injectImport(src, isSvelte);
		}

		writeFileSync(absPath, src);
		console.log(`✓ ${relPath} — ${ops.length} rewrite${ops.length === 1 ? '' : 's'}`);
	}

	skippedCount = plan.length - appliedCount - failures.length;

	// Merge new ICU.* entries directly into admin2's en.yaml. Existing keys
	// are skipped (the original may have hand-tuned ICU placeholders/plurals
	// that the auto-extracted English literal would clobber).
	if (Object.keys(additions).length > 0) {
		const mergeResult = mergeIntoAdmin2Lang(additions);
		console.log(`\n✓ ${mergeResult.added} key${mergeResult.added === 1 ? '' : 's'} merged into ${ADMIN2_LANG_REL}`);
		if (mergeResult.conflicts.length) {
			console.log(`⚠  ${mergeResult.conflicts.length} key${mergeResult.conflicts.length === 1 ? '' : 's'} already defined — skipped (existing value kept):`);
			for (const c of mergeResult.conflicts) {
				console.log(`     ${c.key}\n       existing: ${JSON.stringify(c.existing)}\n       new:      ${JSON.stringify(c.proposed)}`);
			}
		}
	}

	console.log(`\nApplied: ${appliedCount}  Skipped: ${skippedCount}  Failed: ${failures.length}`);
	if (failures.length > 0) {
		console.log('\nFailures:');
		for (const f of failures) {
			console.log(`  ${f.path}:${f.line} (${f.kind}) "${f.text.slice(0, 60)}" — ${f.reason}`);
		}
	}
	process.exit(failures.length > 0 ? 1 : 0);
}

// --- Main (scan mode) ---

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
