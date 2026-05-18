/**
 * Minimal English boot fallback for admin-next.
 *
 * Real translations live in grav-plugin-admin2/languages/*.yaml under the
 * `ICU:` root block, and are served by the API at /api/v1/translations/{lang}.
 *
 * This file holds a tiny set of strings used only when the API has never
 * been reached (cold start, network error before any cache is populated).
 * Keep it small.
 */
const en: Record<string, string> = {
	'ICU.ADMIN_NEXT.LOADING': 'Loading...',
	'ICU.ADMIN_NEXT.SIGN_OUT': 'Sign out',
	'ICU.ADMIN_NEXT.BOOT.TRANSLATIONS_FAILED': 'Translations could not be loaded. Some labels may show as keys.',
	'ICU.ADMIN_NEXT.BOOT.OFFLINE': 'Cannot reach the server.',
};

export default en;
