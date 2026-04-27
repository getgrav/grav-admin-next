#!/usr/bin/env node
/**
 * i18n-audit — find translation key gaps and orphans in admin-next.
 *
 * Walks src/ for translation calls (i18n.t / i18n.tMaybe / __GRAV_I18N.t),
 * compares against the merged translation dictionary from one or more
 * languages/<lang>.yaml files, and reports:
 *
 *   gaps    — keys referenced in code but not defined anywhere (will humanize)
 *   orphans — keys defined but never referenced
 *   maybe   — i18n.tMaybe() call sites (might be plain text, can't tell statically)
 *
 * Usage:
 *   node scripts/i18n-audit.mjs                  # default report
 *   node scripts/i18n-audit.mjs --json           # machine-readable
 *   node scripts/i18n-audit.mjs --api https://...  # pull dict from a running API
 *   node scripts/i18n-audit.mjs --update         # append @@TODO entries to admin2/languages/en.yaml
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const ADMIN2_LANG = resolve(REPO_ROOT, '..', 'grav-plugin-admin2', 'languages', 'en.yaml');
const ADMIN_CLASSIC_LANG = resolve(REPO_ROOT, '..', 'grav-plugin-admin', 'languages', 'en.yaml');
const API_PLUGIN_LANG = resolve(REPO_ROOT, '..', 'grav-plugin-api', 'languages', 'en.yaml');

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_UPDATE = args.includes('--update');
const apiIdx = args.indexOf('--api');
const FLAG_API = apiIdx >= 0 ? args[apiIdx + 1] : null;

// --- File walk ---

function* walk(dir, exts) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		const st = statSync(path);
		if (st.isDirectory()) {
			if (entry === 'node_modules' || entry === '.svelte-kit') continue;
			yield* walk(path, exts);
		} else if (exts.some((e) => entry.endsWith(e))) {
			yield path;
		}
	}
}

// --- Reference extraction ---

// Matches: i18n.t('KEY'), i18n.tMaybe("KEY"), __GRAV_I18N.t('KEY'),
// window.__GRAV_I18N.t('KEY'). Single or double quotes. Captures key + variant.
const REFERENCE_RE = /(?:i18n|__GRAV_I18N)\.(t|tMaybe)\(\s*['"]([A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+)['"]/g;

function extractReferences() {
	const refs = new Map(); // key -> { count, files: Set, variants: Set }
	const maybeOnly = new Set(); // keys only ever seen via tMaybe
	for (const path of walk(SRC_DIR, ['.svelte', '.ts'])) {
		const src = readFileSync(path, 'utf8');
		const rel = path.slice(REPO_ROOT.length + 1);
		let m;
		REFERENCE_RE.lastIndex = 0;
		while ((m = REFERENCE_RE.exec(src)) !== null) {
			const variant = m[1];
			const key = m[2];
			let info = refs.get(key);
			if (!info) {
				info = { count: 0, files: new Set(), variants: new Set() };
				refs.set(key, info);
			}
			info.count++;
			info.files.add(rel);
			info.variants.add(variant);
		}
	}
	for (const [key, info] of refs) {
		if (info.variants.size === 1 && info.variants.has('tMaybe')) {
			maybeOnly.add(key);
		}
	}
	return { refs, maybeOnly };
}

// --- Dictionary loading ---

function flattenYaml(obj, prefix = '') {
	const out = {};
	if (obj === null || typeof obj !== 'object') return out;
	for (const [k, v] of Object.entries(obj)) {
		const next = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			Object.assign(out, flattenYaml(v, next));
		} else if (typeof v === 'string') {
			out[next] = v;
		}
	}
	return out;
}

function loadYamlDict(path) {
	if (!existsSync(path)) return {};
	try {
		const doc = yaml.load(readFileSync(path, 'utf8'));
		return flattenYaml(doc);
	} catch (e) {
		console.error(`Warning: failed to parse ${path}: ${e.message}`);
		return {};
	}
}

async function loadApiDict(url) {
	const res = await fetch(url);
	const json = await res.json();
	return json?.data?.strings ?? {};
}

async function loadDict() {
	if (FLAG_API) {
		const dict = await loadApiDict(FLAG_API);
		return { dict, sources: [`API: ${FLAG_API}`] };
	}
	const sources = [];
	const dict = {};
	const PROJECTS_ROOT = resolve(REPO_ROOT, '..');
	for (const path of [ADMIN_CLASSIC_LANG, API_PLUGIN_LANG, ADMIN2_LANG]) {
		if (existsSync(path)) {
			Object.assign(dict, loadYamlDict(path));
			const display = path.startsWith(PROJECTS_ROOT) ? path.slice(PROJECTS_ROOT.length + 1) : path;
			sources.push(display);
		}
	}
	return { dict, sources };
}

// --- Resolution ---

function isDefined(key, dict) {
	// Admin-next prefers ICU.<key> first, then <key>.
	return ('ICU.' + key) in dict || key in dict;
}

// --- Update mode ---

function appendTodos(gaps) {
	if (!existsSync(ADMIN2_LANG)) {
		console.error(`Cannot --update: ${ADMIN2_LANG} not found.`);
		return;
	}
	const existing = readFileSync(ADMIN2_LANG, 'utf8');
	const trailer = ['', '# === Auto-appended by i18n-audit. Replace @@TODO values with real translations. ==='];
	for (const g of gaps) {
		// Build commented-out hint, leave actual entry for human to integrate.
		trailer.push(`# referenced in: ${[...g.files].slice(0, 3).join(', ')}${g.files.size > 3 ? ` (+${g.files.size - 3} more)` : ''}`);
		trailer.push(`# ICU.${g.key}: "@@TODO ${g.key}"`);
	}
	writeFileSync(ADMIN2_LANG, existing.trimEnd() + '\n' + trailer.join('\n') + '\n');
	console.error(`Wrote ${gaps.length} TODO hints to ${ADMIN2_LANG}.`);
}

// --- Main ---

(async () => {
	const { refs, maybeOnly } = extractReferences();
	const { dict, sources } = await loadDict();

	const gaps = [];
	const orphans = [];

	for (const [key, info] of refs) {
		if (!isDefined(key, dict)) {
			gaps.push({ key, count: info.count, files: info.files, maybeOnly: maybeOnly.has(key) });
		}
	}
	gaps.sort((a, b) => b.count - a.count);

	// Orphans: keys defined under ICU.ADMIN_NEXT.* that are never referenced.
	// Skip non-admin-next keys since they're owned by other plugins.
	for (const dictKey of Object.keys(dict)) {
		if (!dictKey.startsWith('ICU.ADMIN_NEXT.')) continue;
		const bareKey = dictKey.slice('ICU.'.length);
		if (!refs.has(bareKey)) orphans.push(bareKey);
	}
	orphans.sort();

	if (FLAG_JSON) {
		console.log(JSON.stringify({
			sources,
			referenced: refs.size,
			defined: Object.keys(dict).length,
			gaps: gaps.map((g) => ({ key: g.key, count: g.count, files: [...g.files], maybeOnly: g.maybeOnly })),
			orphans,
		}, null, 2));
		return;
	}

	console.log('=== i18n audit ===');
	console.log(`Sources:`);
	sources.forEach((s) => console.log(`  · ${s}`));
	console.log(`References found: ${refs.size} unique keys`);
	console.log(`Dictionary keys: ${Object.keys(dict).length}`);
	console.log('');

	if (gaps.length === 0) {
		console.log('✓ No gaps. Every referenced key resolves.');
	} else {
		console.log(`✗ Gaps (${gaps.length}) — keys referenced in code but undefined (will humanize):`);
		for (const g of gaps) {
			const tag = g.maybeOnly ? ' [tMaybe-only]' : '';
			console.log(`  ${String(g.count).padStart(3)} × ${g.key}${tag}`);
			const files = [...g.files].slice(0, 3);
			files.forEach((f) => console.log(`        ${f}`));
			if (g.files.size > 3) console.log(`        ... (+${g.files.size - 3} more files)`);
		}
		console.log('');
	}

	if (orphans.length > 0) {
		console.log(`Orphans (${orphans.length}) — ICU.ADMIN_NEXT.* defined but never referenced:`);
		orphans.slice(0, 30).forEach((k) => console.log(`  · ${k}`));
		if (orphans.length > 30) console.log(`  ... (+${orphans.length - 30} more)`);
		console.log('');
	}

	if (FLAG_UPDATE) appendTodos(gaps);
})();
