import adapter from '@sveltejs/adapter-static';
import { relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// When building for the admin2 plugin, emit directly into its app/ directory.
const isPluginBuild = !!process.env.ADMIN2_PLUGIN_BUILD;
const pluginAppDir = dirname(fileURLToPath(import.meta.url)) + '/../grav-plugin-admin2/app';

// Base path is a placeholder token that the admin2 PHP plugin substitutes in
// the built assets the first time a request comes in (and whenever the
// configured route changes). This lets the plugin be mounted at any route
// without needing a rebuild.
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
			base: BASE_PLACEHOLDER,
			relative: false
		}
	}
};

export default config;
