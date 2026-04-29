import adapter from '@sveltejs/adapter-static';
import { relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// When building for the admin2 plugin, emit directly into its app/ directory.
const isPluginBuild = !!process.env.ADMIN2_PLUGIN_BUILD;
const pluginAppDir = dirname(fileURLToPath(import.meta.url)) + '/../grav-plugin-admin2/app';

// When building for the plugin, the base path is a placeholder token that
// the admin2 PHP plugin substitutes in materialized assets on first request
// per-site (and whenever the configured route or site root changes). This
// lets the plugin be mounted at any route without rebuilding.
//
// For standalone dev / build (no plugin), base stays empty so the app runs
// at root — e.g. `npm run dev` serves at http://localhost:5173/ as normal.
const BASE_PLACEHOLDER = '/__GRAV_ADMIN2_BASE__';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		adapter: adapter({
			fallback: 'index.html',
			// When building for the plugin, output directly into its app/ directory
			...(isPluginBuild && { pages: pluginAppDir, assets: pluginAppDir })
		}),
		paths: {
			base: isPluginBuild ? BASE_PLACEHOLDER : '',
			relative: false
		},
		// Poll _app/version.json every 60s so the SPA detects when admin2 (or
		// any other plugin) has been updated underneath it. Combined with the
		// beforeNavigate guard in +layout.svelte, the next intra-app navigation
		// becomes a full page load — fresh chunks, no 500s from stale hashes.
		version: {
			pollInterval: 60_000
		}
	}
};

export default config;
