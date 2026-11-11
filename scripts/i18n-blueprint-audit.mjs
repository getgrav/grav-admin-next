#!/usr/bin/env node
/**
 * i18n-blueprint-audit — find PLUGIN_ADMIN.* keys referenced by blueprints
 * that admin2 does not ship a translation for, and measure how far each
 * admin2 locale lags behind English.
 *
 * Blueprints (core + plugins) still write the public PLUGIN_ADMIN.<KEY> label
 * keys. Admin2 stores its translations as one file per locale,
 * grav-plugin-admin2/languages/<locale>.yaml (en-US.yaml, de-DE.yaml, ...),
 * with everything under ICU.ADMIN_NEXT. The shared core vocabulary sits
 * directly under ICU.ADMIN_NEXT.<KEY>, mixed in with admin2's own nested
 * groups (ICU.ADMIN_NEXT.PAGES.*, ICU.ADMIN_NEXT.DASHBOARD.*, ...). There is
 * no ICU.PLUGIN_ADMIN level any more. PLUGIN_ADMIN.<KEY> is aliased onto
 * ICU.ADMIN_NEXT.<KEY> in two places, and this script follows the same rule:
 *
 *   server: grav-plugin-api  Controllers/TranslatesAdminLabels.php::translateLabel()
 *   client: src/lib/stores/i18n.svelte.ts::t()
 *
 * The server only accepts the alias when it resolves to a string. A few
 * ICU.ADMIN_NEXT.<KEY> entries (GROUPS, MEDIA, PAGES, SETTINGS, SYSTEM) are
 * nested maps, so those do NOT count as covered.
 *
 * What it does:
 *
 *   1. greps every blueprint yaml in the install (files under a blueprints/
 *      folder, blueprints.yaml and permissions.yaml; tests/ and vendor/ are
 *      skipped) for PLUGIN_ADMIN.<key>
 *   2. checks each key against en-US.yaml: ICU.ADMIN_NEXT.<key> must exist
 *      and be a string -> "covered"
 *   3. classifies the rest as "portable" (admin classic's flat English in
 *      grav-plugin-admin/languages/en.yaml under PLUGIN_ADMIN has a value
 *      we can port) or "orphan" (no English anywhere: humanized in the UI,
 *      or dead references)
 *   4. counts, for every languages/*.yaml, how many of the referenced keys it
 *      has as strings under ICU.ADMIN_NEXT, against en-US
 *
 * Usage:
 *   node scripts/i18n-blueprint-audit.mjs [--grav-root /path/to/grav]
 *   node scripts/i18n-blueprint-audit.mjs --locales             # headline + per-locale coverage only
 *   node scripts/i18n-blueprint-audit.mjs --json
 *   node scripts/i18n-blueprint-audit.mjs --emit-yaml > missing.yaml   # entries to paste under ICU.ADMIN_NEXT in en-US.yaml
 *   node scripts/i18n-blueprint-audit.mjs --hardcoded           # report hardcoded label/help/text strings
 *   node scripts/i18n-blueprint-audit.mjs --include-admin       # also scan admin classic's own files
 *
 * Defaults:
 *   --grav-root   ~/workspace/grav-api  (override per environment)
 *   admin2 langs  ../grav-plugin-admin2/languages/<locale>.yaml  (English is en-US.yaml)
 *   classic lang  ../grav-plugin-admin/languages/en.yaml          (top-level PLUGIN_ADMIN)
 *
 * Plugins under user/plugins/{admin,admin2,admin-pro} are excluded by default —
 * admin classic's own blueprints/permissions are irrelevant to a Grav 2 install,
 * and admin2's own blueprints reference its own keys. Pass --include-admin to
 * fold them back in.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ADMIN2_LANG_DIR = resolve(REPO_ROOT, '..', 'grav-plugin-admin2', 'languages');
const EN_LOCALE = 'en-US';
const ADMIN_CLASSIC_LANG = resolve(REPO_ROOT, '..', 'grav-plugin-admin', 'languages', 'en.yaml');

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_EMIT = args.includes('--emit-yaml');
const FLAG_LOCALES = args.includes('--locales');
const FLAG_HARDCODED = args.includes('--hardcoded');
const FLAG_INCLUDE_ADMIN = args.includes('--include-admin');
const rootIdx = args.indexOf('--grav-root');
const GRAV_ROOT = rootIdx >= 0
	? resolve(args[rootIdx + 1])
	: resolve(homedir(), 'workspace', 'grav-api');

const DEFAULT_EXCLUDE = new Set(['admin', 'admin2', 'admin-pro', 'admin-19', 'admin-whitebox']);

const KEY_RE = /PLUGIN_ADMIN\.([A-Z0-9_][A-Z0-9_.]*)/g;

// Properties that should hold a translation key (PLUGIN_*.KEY) — anything else is
// a hardcoded English string and a translation gap.
const TRANSLATABLE_PROPS = ['label', 'help', 'title', 'text', 'description', 'success_msg', 'error_msg'];
const TRANSLATABLE_PROPS_RE = new RegExp(`^(\\s+)(${TRANSLATABLE_PROPS.join('|')}):\\s*(.+?)\\s*$`);
const KEY_LIKE_RE = /^['"]?[A-Z][A-Z0-9_]*(\.[A-Z0-9][A-Z0-9_]*)+['"]?$/;
// Skip values that aren't human strings: empty, booleans, numbers, null, YAML scalar markers.
const NON_STRING_RE = /^(['"]{2}|''|""|true|false|null|~|0|1|\d+|\|.*|>.*)$/;

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'cache', 'tests', 'test']);

// Only blueprint files hold admin labels: anything inside a `blueprints/`
// folder, a plugin or theme's `blueprints.yaml`, and `permissions.yaml`
// (admin2 shows its labels in the permission editor). Language files, config,
// OpenAPI specs and other YAML would only add noise.
function isBlueprintFile(entry, inBlueprints) {
	return inBlueprints || entry === 'blueprints.yaml' || entry === 'permissions.yaml';
}

function* walkYaml(dir, inBlueprints = false) {
	let entries;
	try { entries = readdirSync(dir); } catch { return; }
	for (const entry of entries) {
		if (entry.startsWith('.')) continue;
		const path = join(dir, entry);
		let st;
		try { st = statSync(path); } catch { continue; }
		if (st.isDirectory()) {
			if (SKIP_DIRS.has(entry)) continue;
			yield* walkYaml(path, inBlueprints || entry === 'blueprints');
		} else if (entry.endsWith('.yaml') && isBlueprintFile(entry, inBlueprints)) {
			yield path;
		}
	}
}

function blueprintRoots(gravRoot) {
	const roots = [];
	const sysBp = join(gravRoot, 'system', 'blueprints');
	try { if (statSync(sysBp).isDirectory()) roots.push(sysBp); } catch { /* ok */ }
	for (const sub of ['plugins', 'themes']) {
		const base = join(gravRoot, 'user', sub);
		let entries;
		try { entries = readdirSync(base); } catch { continue; }
		for (const name of entries) {
			if (name.startsWith('.')) continue;
			if (sub === 'plugins' && !FLAG_INCLUDE_ADMIN && DEFAULT_EXCLUDE.has(name)) continue;
			const path = join(base, name);
			try { if (statSync(path).isDirectory()) roots.push(path); } catch { /* ok */ }
		}
	}
	return roots;
}

function extractHardcoded(files) {
	const hits = [];
	for (const file of files) {
		let text;
		try { text = readFileSync(file, 'utf8'); } catch { continue; }
		const lines = text.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const m = TRANSLATABLE_PROPS_RE.exec(line);
			if (!m) continue;
			const value = m[3];
			if (!value || NON_STRING_RE.test(value)) continue;
			if (KEY_LIKE_RE.test(value)) continue;
			hits.push({ file, line: i + 1, prop: m[2], value });
		}
	}
	return hits;
}

function extractRefs(files) {
	const refs = new Map();
	for (const file of files) {
		let text;
		try { text = readFileSync(file, 'utf8'); } catch { continue; }
		const lines = text.split('\n');
		for (let i = 0; i < lines.length; i++) {
			KEY_RE.lastIndex = 0;
			let m;
			while ((m = KEY_RE.exec(lines[i])) !== null) {
				const key = m[1].replace(/[._]+$/, '');
				if (!refs.has(key)) refs.set(key, []);
				refs.get(key).push({ file, line: i + 1 });
			}
		}
	}
	return refs;
}

function loadFlatKeys(yamlPath, rootPrefix) {
	const out = new Map();
	let data;
	try { data = yaml.load(readFileSync(yamlPath, 'utf8')); } catch { return out; }
	let node = data ?? {};
	for (const part of rootPrefix.split('.')) {
		if (node && typeof node === 'object' && !Array.isArray(node) && part in node) node = node[part];
		else return out;
	}
	(function flatten(obj, path) {
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
		for (const k of Object.keys(obj)) {
			const v = obj[k];
			const p = path ? `${path}.${k}` : k;
			if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p);
			else out.set(p, typeof v === 'string' ? v : v == null ? '' : String(v));
		}
	})(node, '');
	return out;
}

// Load one admin2 locale file and return its ICU.ADMIN_NEXT map (the raw tree,
// so nested maps stay distinguishable from strings). A parse error is reported,
// not swallowed: js-yaml throws on duplicate keys, which would otherwise read
// as an empty locale.
function loadAdminNext(yamlPath) {
	let data;
	try { data = yaml.load(readFileSync(yamlPath, 'utf8')); } catch (err) {
		return { tree: {}, error: String(err.message).split('\n')[0] };
	}
	const tree = data?.ICU?.ADMIN_NEXT;
	if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return { tree: {}, error: 'no ICU.ADMIN_NEXT block' };
	return { tree, error: null };
}

// Resolve PLUGIN_ADMIN.<key> the way the server alias does: ICU.ADMIN_NEXT.<key>,
// counted only when it is a string. kind is 'string' | 'map' | 'other' | 'missing'.
function lookup(tree, key) {
	let cur = tree;
	for (const part of key.split('.')) {
		if (cur && typeof cur === 'object' && !Array.isArray(cur) && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
		else return { kind: 'missing' };
	}
	if (typeof cur === 'string') return { kind: 'string', value: cur };
	if (cur && typeof cur === 'object' && !Array.isArray(cur)) return { kind: 'map' };
	return { kind: 'other', value: cur };
}

function countStrings(obj) {
	let n = 0;
	for (const v of Object.values(obj)) {
		if (typeof v === 'string') n++;
		else if (v && typeof v === 'object' && !Array.isArray(v)) n += countStrings(v);
	}
	return n;
}

function setNested(obj, dottedKey, value) {
	const parts = dottedKey.split('.');
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const k = parts[i];
		if (!(k in cur) || typeof cur[k] !== 'object') cur[k] = {};
		cur = cur[k];
	}
	cur[parts[parts.length - 1]] = value;
}

// Exit only after stdout has drained: process.exit() right after a large
// console.log() truncates the output when it is piped (the JSON dump is >64 KB).
// Callers `await` it; the promise never settles, so nothing runs after it.
function finish(code) {
	process.exitCode = code;
	return new Promise(() => process.stdout.write('', () => process.exit(code)));
}

function shortPath(file, root) {
	return file.startsWith(root + '/') ? file.slice(root.length + 1) : file;
}

// --- run ---

const roots = blueprintRoots(GRAV_ROOT);
const files = roots.flatMap((r) => [...walkYaml(r, basename(r) === 'blueprints')]);

if (FLAG_HARDCODED) {
	const hits = extractHardcoded(files);
	if (FLAG_JSON) {
		console.log(JSON.stringify({ gravRoot: GRAV_ROOT, blueprintsScanned: files.length, hardcoded: hits }, null, 2));
		await finish(0);
	}
	console.log('# Hardcoded blueprint strings');
	console.log('');
	console.log(`Grav root          : ${GRAV_ROOT}`);
	console.log(`Blueprints scanned : ${files.length}`);
	console.log(`Hardcoded strings  : ${hits.length}`);
	console.log('');
	if (hits.length === 0) {
		console.log('No hardcoded label/help/title/text/description/*_msg values found. ✓');
	} else {
		console.log('These props expect a `PLUGIN_*.KEY` value but contain a literal string. Each is a translation gap — convert to a key, then add the value to admin2/languages/en-US.yaml under ICU.ADMIN_NEXT.');
		console.log('');
		const byFile = new Map();
		for (const h of hits) {
			if (!byFile.has(h.file)) byFile.set(h.file, []);
			byFile.get(h.file).push(h);
		}
		for (const [file, group] of byFile) {
			console.log(`## ${shortPath(file, GRAV_ROOT)}`);
			console.log('');
			for (const { line, prop, value } of group) {
				const oneLine = value.replace(/\n/g, ' ').slice(0, 120);
				console.log(`- L${line}  \`${prop}:\` ${oneLine}`);
			}
			console.log('');
		}
	}
	await finish(hits.length === 0 ? 0 : 1);
}

const refs = extractRefs(files);

const classic = loadFlatKeys(ADMIN_CLASSIC_LANG, 'PLUGIN_ADMIN');

let localeFiles;
try {
	localeFiles = readdirSync(ADMIN2_LANG_DIR).filter((f) => f.endsWith('.yaml')).sort();
} catch {
	console.error(`Cannot read admin2 language directory: ${ADMIN2_LANG_DIR}`);
	process.exit(2);
}
if (!localeFiles.includes(`${EN_LOCALE}.yaml`)) {
	console.error(`Missing ${EN_LOCALE}.yaml in ${ADMIN2_LANG_DIR}`);
	process.exit(2);
}

const locales = new Map(); // locale -> { tree, error }
for (const f of localeFiles) locales.set(f.replace(/\.yaml$/, ''), loadAdminNext(join(ADMIN2_LANG_DIR, f)));
const en = locales.get(EN_LOCALE);
if (en.error) {
	console.error(`Cannot use ${EN_LOCALE}.yaml: ${en.error}`);
	process.exit(2);
}

const covered = [];
const missing = []; // not a string in en-US, but classic has English: portable
const orphan = [];  // no canonical anywhere
// nested: true when ICU.ADMIN_NEXT.<key> is a map (or another non-string) in en-US,
// so the entry cannot simply be pasted in alongside the flat keys.

for (const [key, where] of refs) {
	const hit = lookup(en.tree, key);
	if (hit.kind === 'string') { covered.push(key); continue; }
	const nested = hit.kind !== 'missing';
	const value = classic.get(key);
	if (value !== undefined) missing.push({ key, value, nested, refs: where });
	else orphan.push({ key, nested, refs: where });
}
missing.sort((a, b) => a.key.localeCompare(b.key));
orphan.sort((a, b) => a.key.localeCompare(b.key));
covered.sort();

const enTotalStrings = countStrings(en.tree);
const localeStats = [...locales].map(([locale, { tree, error }]) => {
	const has = error ? 0 : [...refs.keys()].filter((k) => lookup(tree, k).kind === 'string').length;
	const hasOfEnCovered = error ? 0 : covered.filter((k) => lookup(tree, k).kind === 'string').length;
	const totalStrings = error ? 0 : countStrings(tree);
	return {
		locale,
		error,
		referencedHave: has,
		referencedMissing: refs.size - has,
		enCoveredHave: hasOfEnCovered,
		enCoveredMissing: covered.length - hasOfEnCovered,
		totalStrings,
		totalStringsVsEn: enTotalStrings,
	};
});

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');

function printLocaleTable() {
	console.log(`## Per-locale coverage (vs ${EN_LOCALE})`);
	console.log('');
	console.log(`Referenced PLUGIN_ADMIN.* keys present as strings under ICU.ADMIN_NEXT in each languages/<locale>.yaml. "Of en-US" counts only the ${covered.length} keys en-US itself covers. "All strings" is every string under ICU.ADMIN_NEXT, not just referenced keys.`);
	console.log('');
	const rows = [['Locale', 'Referenced', '%', 'Of en-US', '%', 'All strings', '%']];
	for (const s of localeStats) {
		if (s.error) { rows.push([s.locale, `ERROR: ${s.error}`, '', '', '', '', '']); continue; }
		rows.push([
			s.locale,
			`${s.referencedHave}/${refs.size}`, pct(s.referencedHave, refs.size),
			`${s.enCoveredHave}/${covered.length}`, pct(s.enCoveredHave, covered.length),
			`${s.totalStrings}/${s.totalStringsVsEn}`, pct(s.totalStrings, s.totalStringsVsEn),
		]);
	}
	const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
	rows.forEach((r, ri) => {
		console.log(r.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  '));
		if (ri === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
	});
	console.log('');
}

if (FLAG_EMIT) {
	// Entries for ICU.ADMIN_NEXT in en-US.yaml, indented 4 spaces like the file.
	// Keys whose ICU.ADMIN_NEXT.<key> is already a map are skipped (they would
	// clash with the existing group) and listed as a comment instead.
	const tree = {};
	const clashes = [];
	for (const { key, value, nested } of missing) {
		if (nested) { clashes.push(key); continue; }
		setNested(tree, key, value);
	}
	const body = yaml.dump(tree, { lineWidth: -1, indent: 2, noRefs: true, quotingType: '"', forceQuotes: false });
	process.stdout.write(body.split('\n').map((l) => (l ? '    ' + l : l)).join('\n'));
	for (const key of clashes) process.stdout.write(`    # skipped PLUGIN_ADMIN.${key}: ICU.ADMIN_NEXT.${key} is a nested map in ${EN_LOCALE}.yaml\n`);
	await finish(0);
}

if (FLAG_JSON) {
	console.log(JSON.stringify({
		gravRoot: GRAV_ROOT,
		blueprintsScanned: files.length,
		referenced: refs.size,
		covered: covered.length,
		coveredKeys: covered,
		missing,
		orphan,
		locales: localeStats,
	}, null, 2));
	await finish(0);
}

// --- text report ---

console.log('# i18n blueprint audit');
console.log('');
console.log(`Grav root          : ${GRAV_ROOT}`);
console.log(`Blueprint roots    : ${roots.length}`);
console.log(`Blueprints scanned : ${files.length}`);
console.log(`admin2 languages   : ${ADMIN2_LANG_DIR} (${locales.size} locales, English = ${EN_LOCALE}.yaml)`);
console.log(`PLUGIN_ADMIN.* keys: ${refs.size} referenced, ${covered.length} covered, ${missing.length} portable, ${orphan.length} orphan`);
console.log('');

printLocaleTable();

if (FLAG_LOCALES) await finish(0);

if (missing.length) {
	console.log('## Portable — port from admin classic');
	console.log('');
	console.log(`${missing.length} key(s) referenced by blueprints with no string at ICU.ADMIN_NEXT.<KEY> in ${EN_LOCALE}.yaml. Admin classic has canonical English for each.`);
	console.log('');
	for (const { key, value, nested, refs: where } of missing) {
		const sample = where.slice(0, 2).map((r) => `${shortPath(r.file, GRAV_ROOT)}:${r.line}`).join(', ');
		const more = where.length > 2 ? ` _(+${where.length - 2} more)_` : '';
		const oneLine = String(value).replace(/\n/g, ' ').slice(0, 100);
		const note = nested ? ' [ICU.ADMIN_NEXT key is a nested map]' : '';
		console.log(`- \`PLUGIN_ADMIN.${key}\` — ${JSON.stringify(oneLine)}${note}  ↳ ${sample}${more}`);
	}
	console.log('');
	console.log('Run with `--emit-yaml` to print paste-ready entries (4-space indented, for the ICU.ADMIN_NEXT block):');
	console.log('');
	console.log('```');
	console.log('  node scripts/i18n-blueprint-audit.mjs --emit-yaml >> /tmp/missing.yaml');
	console.log('```');
	console.log('');
}

if (orphan.length) {
	console.log('## Orphan — no canonical English (will humanize in UI)');
	console.log('');
	console.log(`${orphan.length} key(s) referenced by blueprints with no string at ICU.ADMIN_NEXT.<KEY> in ${EN_LOCALE}.yaml and no value in admin classic. These render via i18n.svelte.ts:humanizeKey(). Either:`);
	console.log(`  - net-new keys for Grav 2 that need English written and added to admin2 ${EN_LOCALE}.yaml under ICU.ADMIN_NEXT, OR`);
	console.log('  - dead references from removed blueprint fields.');
	console.log('');
	for (const { key, nested, refs: where } of orphan) {
		const sample = where.slice(0, 2).map((r) => `${shortPath(r.file, GRAV_ROOT)}:${r.line}`).join(', ');
		const more = where.length > 2 ? ` _(+${where.length - 2} more)_` : '';
		const note = nested ? ' [ICU.ADMIN_NEXT key is a nested map]' : '';
		console.log(`- \`PLUGIN_ADMIN.${key}\`${note}  ↳ ${sample}${more}`);
	}
	console.log('');
}

if (!missing.length && !orphan.length) {
	console.log(`All PLUGIN_ADMIN.* keys referenced by blueprints are covered by ${EN_LOCALE}.yaml. ✓`);
}
