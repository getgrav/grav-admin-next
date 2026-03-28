import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
