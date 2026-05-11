import adapter from '@sveltejs/adapter-static';
import { relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// When building for the admin2 plugin, emit directly into its app/ directory.
const isPluginBuild = !!process.env.ADMIN2_PLUGIN_BUILD;
const pluginAppDir = dirname(fileURLToPath(import.meta.url)) + '/../grav-plugin-admin2/app';

// Build-time placeholder the admin2 PHP plugin rewrites at request time.
// `paths.base` is used both for in-app navigation (the route the SPA is
// mounted at) and as the URL prefix for the entry-chunk preload links in
// index.html. admin2.php substitutes this placeholder when serving the
// shell HTML (pointing it at the on-disk bundle location), and injects a
// `globalThis.__sveltekit_<nonce>` runtime override so the SPA reports the
// correct route base for in-app navigation. Keeping these separate at
// runtime lets one shared plugin install serve any number of sites with
// different routes or subfolder rootUrls — no per-site copy.
//
// `paths.relative: true` keeps chunk-to-chunk imports and CSS `url()`
// references relative, so Apache can serve them directly from
// user/plugins/admin2/app/ without any per-site rewriting of those files.
//
// For standalone dev / build (no plugin), base stays empty so `npm run dev`
// serves at http://localhost:5173/ as normal.
const BASE_PLACEHOLDER = '/__GRAV_ADMIN2_BASE__';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Defaults to rune mode for the project, except for `node_modules`. Can
		// be removed in svelte 6.
		//
		// Allowlist Svelte 5-native libraries we ship with our own source —
		// they use snippets (`{@render children?.()}`) which silently fall back
		// to legacy slots and lose children when compiled in non-runes mode.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');
			if (!isExternalLibrary) return true;

			const runesLibraries = ['@hueycolor'];
			if (runesLibraries.some((lib) => pathSegments.includes(lib))) return true;

			return undefined;
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
			relative: true
		},
		// Poll _app/version.json every 60s so the SPA detects when admin2 (or
		// any other plugin) has been updated underneath it. The poll URL is
		// derived from `globalThis.__sveltekit_<nonce>.assets` at runtime;
		// admin2.php sets that global to the admin route (e.g. `/admin`) so
		// polls hit the PHP entry point and bypass Grav's `user/*.json`
		// .htaccess block. Combined with the beforeNavigate guard in
		// +layout.svelte, the next intra-app navigation becomes a full page
		// load — fresh chunks, no 500s from stale hashes.
		version: {
			pollInterval: 60_000
		}
	}
};

export default config;
