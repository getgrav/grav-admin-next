import adapter from '@sveltejs/adapter-static';
import { relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isPluginBuild = !!process.env.ADMIN2_BASE;
const pluginAppDir = dirname(fileURLToPath(import.meta.url)) + '/../grav-plugin-admin2/app';

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
			base: process.env.ADMIN2_BASE || '',
			relative: false
		}
	}
};

export default config;
