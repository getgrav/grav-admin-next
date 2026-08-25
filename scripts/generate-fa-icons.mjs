#!/usr/bin/env node
/**
 * Regenerates src/lib/data/fa-icons.ts from the @fortawesome/fontawesome-free
 * metadata, covering every free family — solid, regular and brands.
 *
 * Run with: npm run icons:generate
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = resolve(root, 'node_modules/@fortawesome/fontawesome-free');
const outFile = resolve(root, 'src/lib/data/fa-icons.ts');

const version = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8')).version;
const metadata = JSON.parse(readFileSync(resolve(pkgDir, 'metadata/icon-families.json'), 'utf8'));

const FAMILY_CODE = { solid: 's', regular: 'r', brands: 'b' };
// Grid order: solid first, then regular, then brands for the same name.
const FAMILY_ORDER = ['solid', 'regular', 'brands'];

const icons = [];
const brands = [];

for (const [name, meta] of Object.entries(metadata)) {
	const families = (meta.familyStylesByLicense?.free ?? [])
		.filter((entry) => entry.family === 'classic')
		.map((entry) => entry.style);

	const terms = [...(meta.search?.terms ?? []), ...(meta.aliases?.names ?? [])]
		.map((term) => String(term).toLowerCase().trim())
		.filter(Boolean);
	const seen = new Set();
	const t = terms.filter((term) => !seen.has(term) && seen.add(term)).join(' ');

	for (const style of FAMILY_ORDER) {
		if (!families.includes(style)) continue;
		icons.push({ n: name, t, f: FAMILY_CODE[style] });
		if (style === 'brands') brands.push(name);
	}
}

icons.sort((a, b) => a.n.localeCompare(b.n) || FAMILY_ORDER.indexOf(a.f) - FAMILY_ORDER.indexOf(b.f));
brands.sort();

const counts = FAMILY_ORDER.map(
	(style) => `${icons.filter((icon) => icon.f === FAMILY_CODE[style]).length} ${style}`
).join(', ');

const lines = [
	`// Auto-generated from @fortawesome/fontawesome-free ${version} metadata.`,
	`// Do not edit by hand — run \`npm run icons:generate\` instead.`,
	`// Free icons: ${counts}.`,
	``,
	`/** Font Awesome family: s = solid, r = regular, b = brands. */`,
	`export type FaFamily = 's' | 'r' | 'b';`,
	``,
	`export interface FaIcon {`,
	`\t/** Icon name, without the \`fa-\` prefix. */`,
	`\tn: string;`,
	`\t/** Space-separated search terms and aliases. */`,
	`\tt: string;`,
	`\t/** Family the icon is free in. */`,
	`\tf: FaFamily;`,
	`}`,
	``,
	`export const FA_ICONS: FaIcon[] = [`,
	...icons.map((icon, i) => JSON.stringify(icon) + (i === icons.length - 1 ? '' : ',')),
	`];`,
	``,
	`/**`,
	` * Names that only exist in the brands family. Brand names are unique to that`,
	` * family, so a bare \`fa-github\` can be resolved back to \`fa-brands fa-github\`.`,
	` * Regular icons all share a name with their solid twin and cannot be inferred —`,
	` * they carry an explicit \`fa-regular\` prefix in the stored value.`,
	` */`,
	`export const FA_BRAND_NAMES: ReadonlySet<string> = new Set([`,
	...brands.map((name) => `\t${JSON.stringify(name)},`),
	`]);`,
	``,
];

writeFileSync(outFile, lines.join('\n'));
console.log(`Wrote ${icons.length} icons (${counts}) to ${outFile}`);
