#!/usr/bin/env node
/**
 * i18n-blueprint-audit — find PLUGIN_ADMIN.* keys referenced by blueprints
 * that admin2 does not ship a translation for.
 *
 * Admin classic was the historical source of PLUGIN_ADMIN.* strings used
 * by core + plugin blueprints. Admin2 must be self-sufficient since admin
 * classic is unsupported in Grav 2. This audit:
 *
 *   1. greps every blueprint yaml in the install for PLUGIN_ADMIN.<key>
 *   2. diffs against admin2/languages/en.yaml (flat + ICU.PLUGIN_ADMIN.*)
 *   3. classifies the gap as either "missing" (admin classic has a value
 *      we can port) or "orphan" (no canonical anywhere — humanized
 *      fallback in the UI, or net-new keys that need English written).
 *
 * Usage:
 *   node scripts/i18n-blueprint-audit.mjs [--grav-root /path/to/grav]
 *   node scripts/i18n-blueprint-audit.mjs --json
 *   node scripts/i18n-blueprint-audit.mjs --emit-yaml > missing.yaml
 *   node scripts/i18n-blueprint-audit.mjs --hardcoded           # report hardcoded label/help/text strings
 *   node scripts/i18n-blueprint-audit.mjs --include-admin       # also scan admin classic's own files
 *
 * Defaults:
 *   --grav-root  ~/workspace/grav-api  (override per environment)
 *   admin2 lang  ../grav-plugin-admin2/languages/en.yaml
 *   classic lang ../grav-plugin-admin/languages/en.yaml
 *
 * Plugins under user/plugins/{admin,admin2,admin-pro} are excluded by default —
 * admin classic's own blueprints/permissions are irrelevant to a Grav 2 install,
 * and admin2's own blueprints reference its own keys. Pass --include-admin to
 * fold them back in.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ADMIN2_LANG = resolve(REPO_ROOT, '..', 'grav-plugin-admin2', 'languages', 'en.yaml');
const ADMIN_CLASSIC_LANG = resolve(REPO_ROOT, '..', 'grav-plugin-admin', 'languages', 'en.yaml');

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_EMIT = args.includes('--emit-yaml');
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

function* walkYaml(dir) {
	let entries;
	try { entries = readdirSync(dir); } catch { return; }
	for (const entry of entries) {
		if (entry.startsWith('.')) continue;
		const path = join(dir, entry);
		let st;
		try { st = statSync(path); } catch { continue; }
		if (st.isDirectory()) {
			if (entry === 'node_modules' || entry === 'vendor' || entry === 'cache') continue;
			yield* walkYaml(path);
		} else if (entry.endsWith('.yaml')) {
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

function shortPath(file, root) {
	return file.startsWith(root + '/') ? file.slice(root.length + 1) : file;
}

// --- run ---

const roots = blueprintRoots(GRAV_ROOT);
const files = roots.flatMap((r) => [...walkYaml(r)]);

if (FLAG_HARDCODED) {
	const hits = extractHardcoded(files);
	if (FLAG_JSON) {
		console.log(JSON.stringify({ gravRoot: GRAV_ROOT, blueprintsScanned: files.length, hardcoded: hits }, null, 2));
		process.exit(0);
	}
	console.log('# Hardcoded blueprint strings');
	console.log('');
	console.log(`Grav root          : ${GRAV_ROOT}`);
	console.log(`YAML files scanned : ${files.length}`);
	console.log(`Hardcoded strings  : ${hits.length}`);
	console.log('');
	if (hits.length === 0) {
		console.log('No hardcoded label/help/title/text/description/*_msg values found. ✓');
	} else {
		console.log('These props expect a `PLUGIN_*.KEY` value but contain a literal string. Each is a translation gap — convert to a key, then add the value to admin2/languages/en.yaml under ICU.PLUGIN_ADMIN.');
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
	process.exit(hits.length === 0 ? 0 : 1);
}

const refs = extractRefs(files);

const admin2Flat = loadFlatKeys(ADMIN2_LANG, 'PLUGIN_ADMIN');
const admin2Icu = loadFlatKeys(ADMIN2_LANG, 'ICU.PLUGIN_ADMIN');
const classic = loadFlatKeys(ADMIN_CLASSIC_LANG, 'PLUGIN_ADMIN');

const known = new Set([...admin2Flat.keys(), ...admin2Icu.keys()]);
const missing = []; // have classic value
const orphan = [];  // no canonical anywhere

for (const [key, where] of refs) {
	if (known.has(key)) continue;
	const value = classic.get(key);
	if (value !== undefined) missing.push({ key, value, refs: where });
	else orphan.push({ key, refs: where });
}
missing.sort((a, b) => a.key.localeCompare(b.key));
orphan.sort((a, b) => a.key.localeCompare(b.key));

if (FLAG_EMIT) {
	const tree = { ICU: { PLUGIN_ADMIN: {} } };
	for (const { key, value } of missing) setNested(tree.ICU.PLUGIN_ADMIN, key, value);
	process.stdout.write(yaml.dump(tree, { lineWidth: -1, indent: 2, noRefs: true, quotingType: '"', forceQuotes: false }));
	process.exit(0);
}

if (FLAG_JSON) {
	console.log(JSON.stringify({
		gravRoot: GRAV_ROOT,
		blueprintsScanned: files.length,
		referenced: refs.size,
		covered: refs.size - missing.length - orphan.length,
		missing,
		orphan,
	}, null, 2));
	process.exit(0);
}

// --- text report ---

console.log('# i18n blueprint audit');
console.log('');
console.log(`Grav root          : ${GRAV_ROOT}`);
console.log(`Blueprint roots    : ${roots.length}`);
console.log(`YAML files scanned : ${files.length}`);
console.log(`PLUGIN_ADMIN.* keys: ${refs.size} referenced, ${refs.size - missing.length - orphan.length} covered, ${missing.length} portable, ${orphan.length} orphan`);
console.log('');

if (missing.length) {
	console.log('## Missing — port from admin classic');
	console.log('');
	console.log(`${missing.length} key(s) referenced by blueprints but absent from admin2's en.yaml. Admin classic has canonical English for each.`);
	console.log('');
	for (const { key, value, refs: where } of missing) {
		const sample = where.slice(0, 2).map((r) => `${shortPath(r.file, GRAV_ROOT)}:${r.line}`).join(', ');
		const more = where.length > 2 ? ` _(+${where.length - 2} more)_` : '';
		const oneLine = String(value).replace(/\n/g, ' ').slice(0, 100);
		console.log(`- \`PLUGIN_ADMIN.${key}\` — ${JSON.stringify(oneLine)}  ↳ ${sample}${more}`);
	}
	console.log('');
	console.log('Run with `--emit-yaml` to print a paste-ready ICU block:');
	console.log('');
	console.log('```');
	console.log('  node scripts/i18n-blueprint-audit.mjs --emit-yaml >> /tmp/missing.yaml');
	console.log('```');
	console.log('');
}

if (orphan.length) {
	console.log('## Orphan — no canonical English (will humanize in UI)');
	console.log('');
	console.log(`${orphan.length} key(s) referenced by blueprints with no value in admin classic OR admin2. These render via i18n.svelte.ts:humanizeKey(). Either:`);
	console.log('  - net-new keys for Grav 2 that need English written and added to admin2 en.yaml under ICU.PLUGIN_ADMIN, OR');
	console.log('  - dead references from removed blueprint fields.');
	console.log('');
	for (const { key, refs: where } of orphan) {
		const sample = where.slice(0, 2).map((r) => `${shortPath(r.file, GRAV_ROOT)}:${r.line}`).join(', ');
		const more = where.length > 2 ? ` _(+${where.length - 2} more)_` : '';
		console.log(`- \`PLUGIN_ADMIN.${key}\`  ↳ ${sample}${more}`);
	}
	console.log('');
}

if (!missing.length && !orphan.length) {
	console.log('All PLUGIN_ADMIN.* keys referenced by blueprints are covered by admin2. ✓');
}
