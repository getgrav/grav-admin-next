/**
 * Font Awesome icon helpers.
 *
 * Icons reach the admin from three places — Grav plugin manifests, blueprint
 * `iconpicker` fields, and admin settings such as the menubar links — and they
 * arrive in a mix of shapes: a bare name ("plug"), a prefixed name ("fa-plug"),
 * a family-qualified pair ("fa-brands fa-github"), or a legacy FA4 name
 * ("photo"). `faIconClass()` turns any of those into the FA7 classes that
 * actually render.
 *
 * Family matters: brands and regular icons live in different webfonts to solid,
 * so `fa-solid fa-whatsapp` renders nothing at all. Brand names are unique to
 * the brands family, so a bare name can be resolved from the generated
 * `FA_BRAND_NAMES` set. Regular icons share every name with a solid twin, so
 * they can only be identified by an explicit `fa-regular` prefix in the value.
 */
import { FA_BRAND_NAMES, type FaFamily } from '$lib/data/fa-icons';

export type { FaFamily };

/**
 * Complete FA4 → FA7 shim mapping from the official @fortawesome/fontawesome-free v4-shims.
 * Format: oldName → [newName, family]
 * Only includes entries where the name actually changed.
 */
const FA_V4_SHIMS: Record<string, [string, FaFamily]> = {
	// Solid renames
	'glass': ['martini-glass-empty', 's'],
	'remove': ['xmark', 's'],
	'close': ['xmark', 's'],
	'trash-o': ['trash-can', 's'],
	'home': ['house', 's'],
	'repeat': ['arrow-rotate-right', 's'],
	'rotate-right': ['arrow-rotate-right', 's'],
	'refresh': ['arrows-rotate', 's'],
	'dedent': ['outdent', 's'],
	'video-camera': ['video', 's'],
	'photo': ['image', 's'],
	'map-marker': ['location-dot', 's'],
	'arrows': ['up-down-left-right', 's'],
	'mail-forward': ['share', 's'],
	'expand': ['up-right-and-down-left-from-center', 's'],
	'compress': ['down-left-and-up-right-to-center', 's'],
	'warning': ['triangle-exclamation', 's'],
	'calendar': ['calendar-days', 's'],
	'arrows-v': ['up-down', 's'],
	'arrows-h': ['left-right', 's'],
	'bar-chart': ['chart-column', 's'],
	'bar-chart-o': ['chart-column', 's'],
	'thumb-tack': ['thumbtack', 's'],
	'external-link': ['up-right-from-square', 's'],
	'sign-in': ['right-to-bracket', 's'],
	'sign-out': ['right-from-bracket', 's'],
	'feed': ['rss', 's'],
	'globe': ['earth-americas', 's'],
	'tasks': ['bars-progress', 's'],
	'arrows-alt': ['maximize', 's'],
	'group': ['users', 's'],
	'chain': ['link', 's'],
	'cut': ['scissors', 's'],
	'navicon': ['bars', 's'],
	'reorder': ['bars', 's'],
	'magic': ['wand-magic-sparkles', 's'],
	'money': ['money-bill-1', 's'],
	'unsorted': ['sort', 's'],
	'sort-desc': ['sort-down', 's'],
	'sort-asc': ['sort-up', 's'],
	'rotate-left': ['arrow-rotate-left', 's'],
	'legal': ['gavel', 's'],
	'tachometer': ['gauge-high', 's'],
	'dashboard': ['gauge-high', 's'],
	'flash': ['bolt', 's'],
	'clipboard': ['paste', 's'],
	'exchange': ['right-left', 's'],
	'cloud-download': ['cloud-arrow-down', 's'],
	'cloud-upload': ['cloud-arrow-up', 's'],
	'cutlery': ['utensils', 's'],
	'tablet': ['tablet-screen-button', 's'],
	'mobile': ['mobile-screen-button', 's'],
	'mobile-phone': ['mobile-screen-button', 's'],
	'mail-reply': ['reply', 's'],
	'mail-reply-all': ['reply-all', 's'],
	'code-fork': ['code-branch', 's'],
	'chain-broken': ['link-slash', 's'],
	'unlink': ['link-slash', 's'],
	'unlock-alt': ['unlock', 's'],
	'level-up': ['turn-up', 's'],
	'level-down': ['turn-down', 's'],
	'pencil-square': ['square-pen', 's'],
	'external-link-square': ['square-up-right', 's'],
	'share-square-o': ['share-from-square', 's'],
	'share-square': ['share-from-square', 's'],
	'shopping-cart': ['cart-shopping', 's'],
	'circle-o-notch': ['circle-notch', 's'],
	'send': ['paper-plane', 's'],
	'header': ['heading', 's'],
	'institution': ['building-columns', 's'],
	'bank': ['building-columns', 's'],
	'mortar-board': ['graduation-cap', 's'],
	'television': ['tv', 's'],
	'commenting': ['comment-dots', 's'],
	'sort-alpha-asc': ['arrow-down-a-z', 's'],
	'sort-alpha-desc': ['arrow-down-z-a', 's'],
	'sort-amount-asc': ['arrow-down-short-wide', 's'],
	'sort-amount-desc': ['arrow-down-wide-short', 's'],
	'sort-numeric-asc': ['arrow-down-1-9', 's'],
	'sort-numeric-desc': ['arrow-down-9-1', 's'],
	'hotel': ['bed', 's'],
	'automobile': ['car', 's'],
	'cab': ['taxi', 's'],
	'life-bouy': ['life-ring', 's'],
	'life-buoy': ['life-ring', 's'],
	'life-saver': ['life-ring', 's'],
	'support': ['life-ring', 's'],
	'file-text': ['file-lines', 's'],
	'hourglass-o': ['hourglass', 's'],
	'hourglass-1': ['hourglass-start', 's'],
	'hourglass-2': ['hourglass-half', 's'],
	'hourglass-3': ['hourglass-end', 's'],
	'volume-control-phone': ['phone-volume', 's'],
	'asl-interpreting': ['hands-asl-interpreting', 's'],
	'deafness': ['ear-deaf', 's'],
	'hard-of-hearing': ['ear-deaf', 's'],
	'signing': ['hands', 's'],
	'vcard': ['address-card', 's'],
	'drivers-license': ['id-card', 's'],
	'thermometer-4': ['temperature-full', 's'],
	'thermometer': ['temperature-full', 's'],
	'thermometer-3': ['temperature-three-quarters', 's'],
	'thermometer-2': ['temperature-half', 's'],
	'thermometer-1': ['temperature-quarter', 's'],
	'thermometer-0': ['temperature-empty', 's'],
	'bathtub': ['bath', 's'],
	's15': ['bath', 's'],
	'long-arrow-down': ['down-long', 's'],
	'long-arrow-up': ['up-long', 's'],
	'long-arrow-left': ['left-long', 's'],
	'long-arrow-right': ['right-long', 's'],
	'trash': ['trash-can', 's'],
	'eyedropper': ['eye-dropper', 's'],
	'area-chart': ['chart-area', 's'],
	'pie-chart': ['chart-pie', 's'],
	'line-chart': ['chart-line', 's'],
	'battery-4': ['battery-full', 's'],
	'battery': ['battery-full', 's'],
	'battery-3': ['battery-three-quarters', 's'],
	'battery-2': ['battery-half', 's'],
	'battery-1': ['battery-quarter', 's'],
	'battery-0': ['battery-empty', 's'],
	'transgender': ['mars-and-venus', 's'],
	'intersex': ['mars-and-venus', 's'],
	'transgender-alt': ['transgender', 's'],
	'credit-card-alt': ['credit-card', 's'],
	'paint-brush': ['paintbrush', 's'],
	'exclamation-circle': ['circle-exclamation', 's'],
	'exclamation-triangle': ['triangle-exclamation', 's'],

	// Regular (outline) renames — FA4 "-o" suffix → FA7 "fa-regular"
	'envelope-o': ['envelope', 'r'],
	'star-o': ['star', 'r'],
	'file-o': ['file', 'r'],
	'clock-o': ['clock', 'r'],
	'arrow-circle-o-down': ['circle-down', 'r'],
	'arrow-circle-o-up': ['circle-up', 'r'],
	'play-circle-o': ['circle-play', 'r'],
	'list-alt': ['rectangle-list', 'r'],
	'picture-o': ['image', 'r'],
	'pencil-square-o': ['pen-to-square', 'r'],
	'edit': ['pen-to-square', 'r'],
	'check-square-o': ['square-check', 'r'],
	'times-circle-o': ['circle-xmark', 'r'],
	'check-circle-o': ['circle-check', 'r'],
	'eye-slash': ['eye-slash', 'r'],
	'thumbs-o-up': ['thumbs-up', 'r'],
	'thumbs-o-down': ['thumbs-down', 'r'],
	'heart-o': ['heart', 'r'],
	'lemon-o': ['lemon', 'r'],
	'square-o': ['square', 'r'],
	'bookmark-o': ['bookmark', 'r'],
	'hdd-o': ['hard-drive', 'r'],
	'hand-o-right': ['hand-point-right', 'r'],
	'hand-o-left': ['hand-point-left', 'r'],
	'hand-o-up': ['hand-point-up', 'r'],
	'hand-o-down': ['hand-point-down', 'r'],
	'files-o': ['copy', 'r'],
	'floppy-o': ['floppy-disk', 'r'],
	'save': ['floppy-disk', 'r'],
	'comment-o': ['comment', 'r'],
	'comments-o': ['comments', 'r'],
	'lightbulb-o': ['lightbulb', 'r'],
	'bell-o': ['bell', 'r'],
	'file-text-o': ['file-lines', 'r'],
	'building-o': ['building', 'r'],
	'hospital-o': ['hospital', 'r'],
	'circle-o': ['circle', 'r'],
	'folder-o': ['folder', 'r'],
	'folder-open-o': ['folder-open', 'r'],
	'smile-o': ['face-smile', 'r'],
	'frown-o': ['face-frown', 'r'],
	'meh-o': ['face-meh', 'r'],
	'keyboard-o': ['keyboard', 'r'],
	'flag-o': ['flag', 'r'],
	'star-half-o': ['star-half-stroke', 'r'],
	'star-half-empty': ['star-half-stroke', 'r'],
	'star-half-full': ['star-half-stroke', 'r'],
	'calendar-o': ['calendar', 'r'],
	'minus-square-o': ['square-minus', 'r'],
	'compass': ['compass', 'r'],
	'caret-square-o-down': ['square-caret-down', 'r'],
	'toggle-down': ['square-caret-down', 'r'],
	'caret-square-o-up': ['square-caret-up', 'r'],
	'toggle-up': ['square-caret-up', 'r'],
	'caret-square-o-right': ['square-caret-right', 'r'],
	'toggle-right': ['square-caret-right', 'r'],
	'caret-square-o-left': ['square-caret-left', 'r'],
	'toggle-left': ['square-caret-left', 'r'],
	'paper-plane-o': ['paper-plane', 'r'],
	'send-o': ['paper-plane', 'r'],
	'futbol-o': ['futbol', 'r'],
	'soccer-ball-o': ['futbol', 'r'],
	'newspaper-o': ['newspaper', 'r'],
	'bell-slash-o': ['bell-slash', 'r'],
	'copyright': ['copyright', 'r'],
	'cc': ['closed-captioning', 'r'],
	'diamond': ['gem', 'r'],
	'address-card-o': ['address-card', 'r'],
	'vcard-o': ['address-card', 'r'],
	'user-circle-o': ['circle-user', 'r'],
	'user-o': ['user', 'r'],
	'id-badge': ['id-badge', 'r'],
	'id-card-o': ['id-card', 'r'],
	'drivers-license-o': ['id-card', 'r'],
	'question-circle-o': ['circle-question', 'r'],
	'plus-square-o': ['square-plus', 'r'],
	'address-book-o': ['address-book', 'r'],
	'registered': ['registered', 'r'],
	'object-group': ['object-group', 'r'],
	'object-ungroup': ['object-ungroup', 'r'],
	'sticky-note-o': ['note-sticky', 'r'],
	'clone': ['clone', 'r'],
	'hand-rock-o': ['hand-back-fist', 'r'],
	'hand-grab-o': ['hand-back-fist', 'r'],
	'hand-paper-o': ['hand', 'r'],
	'hand-stop-o': ['hand', 'r'],
	'hand-scissors-o': ['hand-scissors', 'r'],
	'hand-lizard-o': ['hand-lizard', 'r'],
	'hand-spock-o': ['hand-spock', 'r'],
	'hand-pointer-o': ['hand-pointer', 'r'],
	'hand-peace-o': ['hand-peace', 'r'],
	'calendar-plus-o': ['calendar-plus', 'r'],
	'calendar-minus-o': ['calendar-minus', 'r'],
	'calendar-times-o': ['calendar-xmark', 'r'],
	'calendar-check-o': ['calendar-check', 'r'],
	'map-o': ['map', 'r'],
	'commenting-o': ['comment-dots', 'r'],
	'pause-circle-o': ['circle-pause', 'r'],
	'stop-circle-o': ['circle-stop', 'r'],
	'handshake-o': ['handshake', 'r'],
	'envelope-open-o': ['envelope-open', 'r'],
	'sun-o': ['sun', 'r'],
	'moon-o': ['moon', 'r'],
	'arrow-circle-o-right': ['circle-right', 'r'],
	'arrow-circle-o-left': ['circle-left', 'r'],
	'dot-circle-o': ['circle-dot', 'r'],
	'window-maximize': ['window-maximize', 'r'],
	'window-restore': ['window-restore', 'r'],
	'window-close-o': ['rectangle-xmark', 'r'],
	'times-rectangle-o': ['rectangle-xmark', 'r'],
	'snowflake-o': ['snowflake', 'r'],
	'file-pdf-o': ['file-pdf', 'r'],
	'file-word-o': ['file-word', 'r'],
	'file-excel-o': ['file-excel', 'r'],
	'file-powerpoint-o': ['file-powerpoint', 'r'],
	'file-image-o': ['file-image', 'r'],
	'file-photo-o': ['file-image', 'r'],
	'file-picture-o': ['file-image', 'r'],
	'file-archive-o': ['file-zipper', 'r'],
	'file-zip-o': ['file-zipper', 'r'],
	'file-audio-o': ['file-audio', 'r'],
	'file-sound-o': ['file-audio', 'r'],
	'file-video-o': ['file-video', 'r'],
	'file-movie-o': ['file-video', 'r'],
	'file-code-o': ['file-code', 'r'],
	'credit-card': ['credit-card', 'r'],
	'eye': ['eye', 'r'],

	// Brand renames
	'youtube-play': ['youtube', 'b'],
	'twitter-square': ['square-twitter', 'b'],
	'facebook-square': ['square-facebook', 'b'],
	'facebook': ['facebook-f', 'b'],
	'facebook-f': ['facebook-f', 'b'],
	'linkedin-square': ['linkedin', 'b'],
	'linkedin': ['linkedin-in', 'b'],
	'github-square': ['square-github', 'b'],
	'google-plus-square': ['square-google-plus', 'b'],
	'google-plus': ['google-plus-g', 'b'],
	'pinterest-square': ['square-pinterest', 'b'],
	'bitcoin': ['btc', 'b'],
	'youtube-square': ['square-youtube', 'b'],
	'xing-square': ['square-xing', 'b'],
	'bitbucket-square': ['bitbucket', 'b'],
	'tumblr-square': ['square-tumblr', 'b'],
	'vimeo-square': ['square-vimeo', 'b'],
	'reddit-square': ['square-reddit', 'b'],
	'behance-square': ['square-behance', 'b'],
	'steam-square': ['square-steam', 'b'],
	'lastfm-square': ['square-lastfm', 'b'],
	'facebook-official': ['facebook', 'b'],
	'google-plus-official': ['google-plus', 'b'],
	'google-plus-circle': ['google-plus', 'b'],
	'vimeo': ['vimeo-v', 'b'],
	'snapchat-ghost': ['snapchat', 'b'],
	'snapchat-square': ['square-snapchat', 'b'],
	'viadeo-square': ['square-viadeo', 'b'],
	'odnoklassniki-square': ['square-odnoklassniki', 'b'],
	'wheelchair-alt': ['accessible-icon', 'b'],
	'gittip': ['gratipay', 'b'],
	'wechat': ['weixin', 'b'],
	'y-combinator-square': ['hacker-news', 'b'],
	'yc-square': ['hacker-news', 'b'],
	'yc': ['y-combinator', 'b'],
	'eercast': ['sellcast', 'b'],
	'fa': ['font-awesome', 'b'],
	'ge': ['empire', 'b'],
	'ra': ['rebel', 'b'],
	'resistance': ['rebel', 'b'],
};

/** CSS class for each family. */
export const FA_FAMILY_CLASS: Record<FaFamily, string> = {
	's': 'fa-solid',
	'r': 'fa-regular',
	'b': 'fa-brands',
};

// Icons whose meaning reverses with reading direction (e.g. "next"/"previous"
// arrows). In RTL we emit a `.flip-rtl` class alongside the FA class so the
// CSS utility in layout.css applies `transform: scaleX(-1)` to mirror them.
// Plugins shipping their own icons can opt in by referencing the same class.
const DIRECTIONAL_ICONS = new Set([
	'long-arrow-left', 'long-arrow-right',
	'left-long', 'right-long',
	'arrow-left', 'arrow-right',
	'chevron-left', 'chevron-right',
	'angle-left', 'angle-right',
	'caret-left', 'caret-right',
	'arrow-circle-left', 'arrow-circle-right',
	'circle-arrow-left', 'circle-arrow-right',
	'chevron-circle-left', 'chevron-circle-right',
]);

const FAMILY_ALIASES: Record<string, FaFamily> = {
	'fa-solid': 's',
	fas: 's',
	'fa-regular': 'r',
	far: 'r',
	'fa-brands': 'b',
	fab: 'b',
};

export interface FaIconValue {
	/** Icon name without the `fa-` prefix. */
	name: string;
	/** Family the value explicitly names, or null when it has to be inferred. */
	family: FaFamily | null;
}

/**
 * Split a stored icon value into its name and — when the value says so — its
 * family. Accepts "github", "fa-github", "fa-brands fa-github" and "fab github".
 */
export function parseFaIconValue(value: string | null | undefined): FaIconValue {
	if (!value) return { name: '', family: null };

	let family: FaFamily | null = null;
	let name = '';

	for (const token of value.trim().split(/\s+/)) {
		const alias = FAMILY_ALIASES[token];
		if (alias) {
			family = alias;
			continue;
		}
		if (token === 'fa' || token === 'fa-classic') continue;
		name = token.replace(/^fa-/, '');
	}

	return { name, family };
}

/** The family an icon renders in when the stored value does not name one. */
export function inferFaFamily(name: string): FaFamily {
	return FA_BRAND_NAMES.has(name) ? 'b' : 's';
}

/**
 * Build the value to store for a picked icon. Solid icons keep the historic
 * bare `fa-<name>` form; the other families carry their family class so themes
 * and the admin both render them correctly.
 */
export function faIconValue(name: string, family: FaFamily): string {
	return family === 's' ? `fa-${name}` : `${FA_FAMILY_CLASS[family]} fa-${name}`;
}

/** Resolve any stored icon value to the FA7 classes that render it. */
export function faIconClass(icon: string | null | undefined): string {
	if (!icon) return '';

	const { name: parsed, family: declared } = parseFaIconValue(icon);
	if (!parsed) return '';

	const directional = DIRECTIONAL_ICONS.has(parsed) ? ' flip-rtl' : '';

	// An explicit family wins — it is the only way to ask for a regular icon.
	if (declared) {
		return `${FA_FAMILY_CLASS[declared]} fa-${parsed}${directional}`;
	}

	// Check the v4 shim next — gives us both new name and correct family
	const shim = FA_V4_SHIMS[parsed];
	if (shim) {
		return `${FA_FAMILY_CLASS[shim[1]]} fa-${shim[0]}${directional}`;
	}

	return `${FA_FAMILY_CLASS[inferFaFamily(parsed)]} fa-${parsed}${directional}`;
}
