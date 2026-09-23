import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

/**
 * Lucide icons that plugins name at runtime ("shield-check", "ShieldCheck"),
 * served as small lazy chunks instead of the whole icon set.
 *
 * `virtual:lucide-icons/<letter>` exports every icon whose component name
 * starts with that letter, keyed by that name. `virtual:lucide-icons/aliases`
 * maps lucide's old names to the current ones. Both are built from the
 * installed lucide-svelte, so an upgrade needs no regeneration step. See
 * src/lib/utils/lucide-icon.ts.
 */
function lucideIconBuckets(): Plugin {
	const PREFIX = 'virtual:lucide-icons/';
	let buckets: Map<string, Map<string, string>> | null = null;
	let aliases: Record<string, string> | null = null;

	function scan() {
		if (buckets && aliases) return;
		const dist = dirname(createRequire(import.meta.url).resolve('lucide-svelte'));
		const exportsOf = (file: string) => {
			// Strip comments first: lucide's `@deprecated` notes sit inside the braces.
			const src = readFileSync(resolve(dist, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
			const out: Array<[string, string]> = [];
			for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
				const kebab = m[2].replace(/^.*\//, '').replace(/\.(svelte|js)$/, '');
				for (const n of m[1].matchAll(/default\s+as\s+(\w+)/g)) out.push([n[1], kebab]);
			}
			return out;
		};

		buckets = new Map();
		const canonical = new Map<string, string>();
		for (const [name, kebab] of exportsOf('icons/index.js')) {
			const letter = name[0].toLowerCase();
			if (!buckets.has(letter)) buckets.set(letter, new Map());
			buckets.get(letter)!.set(name, kebab);
			canonical.set(kebab, name);
		}
		// An alias export points at a stub (icons/alert-circle.js) that re-exports
		// the current icon (./circle-alert.svelte); follow it to the current name.
		aliases = {};
		for (const [name, stub] of exportsOf('aliases/aliases.js')) {
			let target = canonical.get(stub);
			if (!target) {
				const src = readFileSync(resolve(dist, `icons/${stub}.js`), 'utf8');
				const current = src.match(/from\s*['"]\.\/([\w-]+)\.svelte['"]/)?.[1];
				target = current ? canonical.get(current) : undefined;
			}
			if (target && target !== name) aliases[name] = target;
		}
	}

	return {
		name: 'grav-lucide-icon-buckets',
		resolveId(id) {
			return id.startsWith(PREFIX) ? '\0' + id : null;
		},
		load(id) {
			if (!id.startsWith('\0' + PREFIX)) return null;
			scan();
			const key = id.slice(PREFIX.length + 1);
			if (key === 'aliases') return `export default ${JSON.stringify(aliases)};`;
			const icons = buckets!.get(key);
			if (!icons) return 'export default {};';
			const lines: string[] = [];
			const entries: string[] = [];
			let i = 0;
			for (const [name, kebab] of icons) {
				lines.push(`import I${i} from 'lucide-svelte/icons/${kebab}';`);
				entries.push(`${JSON.stringify(name)}: I${i}`);
				i++;
			}
			return `${lines.join('\n')}\nexport default { ${entries.join(', ')} };`;
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), lucideIconBuckets(), sveltekit()],
	server: {
		proxy: {
			// Proxy all Grav requests (API + media files) during development
			'/grav-api': {
				target: 'https://localhost',
				changeOrigin: true,
				secure: false // allow self-signed certs
			}
		}
	}
});
