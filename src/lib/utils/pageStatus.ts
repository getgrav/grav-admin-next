import { CircleCheck, CircleDashed, CircleOff, Clock } from 'lucide-svelte';
import { i18n } from '$lib/stores/i18n.svelte';

/**
 * The four states a page's publication can be in.
 *
 * `published` / `unpublished` are the two the admin has always shown. The API
 * (plugin `api` >= 1.0.35) additionally resolves the two *time-based* states
 * that were previously invisible: a page whose `publish_date` is still in the
 * future (`scheduled`) and one whose `unpublish_date` has already passed
 * (`expired`). Both used to render as a plain green "Published" tick even
 * though visitors could not see the page, which is what getgrav/grav-plugin-admin#2523
 * reported.
 */
export type PageStatusKey = 'published' | 'unpublished' | 'scheduled' | 'expired';

/** The publication fields the registry reads off a page. */
export interface PageStatusSource {
	published?: boolean;
	/**
	 * Resolved state from the API. Absent on API versions before 1.0.35 — the
	 * registry then falls back to the `published` boolean and reports only the
	 * two states the older API could describe.
	 */
	publish_state?: PageStatusKey | string | null;
	/** Date the page goes live, from `header.publish_date`. */
	publish_date?: string | null;
	/** Date the page comes down, from `header.unpublish_date`. */
	unpublish_date?: string | null;
}

/**
 * Presentation for one status: an icon, a colour and the strings. Each state
 * gets its OWN icon as well as its own colour, so the four are still tellable
 * apart in greyscale and for colourblind readers — a pair of coloured dots,
 * which is what classic admin used, conveys nothing without colour.
 *
 * Every colour comes from a host CSS custom property (`--success`,
 * `--warning`, `--destructive`, `--muted-foreground`) by way of the Tailwind
 * aliases declared in `src/routes/layout.css`, so a re-themed admin restyles
 * the indicator with it.
 */
export interface PageStatusInfo {
	key: PageStatusKey;
	icon: typeof CircleCheck;
	/** Text colour class for the icon form. */
	colorClass: string;
	/** Background + text classes for the pill form. */
	pillClass: string;
	/** `Badge` variant for the pill's full-size equivalent. */
	badgeVariant: 'success' | 'secondary' | 'warning' | 'destructive';
	/** Short label, e.g. "Scheduled". */
	label: string;
	/**
	 * Tooltip / accessible description. For `scheduled` and `expired` this
	 * names the date the page is waiting on, which is the whole reason those
	 * two states are worth distinguishing.
	 */
	title: string;
	/** The date this state hangs on, already localized, when there is one. */
	date?: string;
}

/** Static half of the registry — everything that does not need translating. */
const PRESENTATION: Record<PageStatusKey, Omit<PageStatusInfo, 'label' | 'title' | 'date' | 'key'>> = {
	published: {
		icon: CircleCheck,
		colorClass: 'text-success',
		pillClass: 'bg-success/15 text-success',
		badgeVariant: 'success',
	},
	unpublished: {
		icon: CircleDashed,
		colorClass: 'text-muted-foreground',
		pillClass: 'bg-muted text-muted-foreground',
		badgeVariant: 'secondary',
	},
	scheduled: {
		icon: Clock,
		colorClass: 'text-warning',
		pillClass: 'bg-warning/15 text-warning',
		badgeVariant: 'warning',
	},
	expired: {
		icon: CircleOff,
		colorClass: 'text-destructive',
		pillClass: 'bg-destructive/15 text-destructive',
		badgeVariant: 'destructive',
	},
};

const LABEL_KEYS: Record<PageStatusKey, string> = {
	published: 'ADMIN_NEXT.PAGES.PUBLISHED',
	unpublished: 'ADMIN_NEXT.PAGES.DRAFT',
	scheduled: 'ADMIN_NEXT.PAGES.STATUS.SCHEDULED',
	expired: 'ADMIN_NEXT.PAGES.STATUS.EXPIRED',
};

/**
 * Render a stored date for display, falling back to the raw string when it is
 * not something `Date` can parse (a half-typed `publish_date` in frontmatter
 * is still worth showing verbatim rather than as "Invalid Date").
 */
function formatStatusDate(value: string | null | undefined): string | undefined {
	if (typeof value !== 'string' || value === '') return undefined;
	const parsed = new Date(value);
	return isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/**
 * Narrow whatever the API sent to one of the four keys.
 *
 * An API that does not send `publish_state` at all — anything before plugin
 * `api` 1.0.35 — degrades to the two-state reading the admin has always used,
 * so an older backend keeps rendering correctly instead of showing every page
 * as a draft.
 */
export function pageStatusKey(page: PageStatusSource): PageStatusKey {
	const state = page.publish_state;
	if (state === 'published' || state === 'unpublished' || state === 'scheduled' || state === 'expired') {
		return state;
	}
	return page.published ? 'published' : 'unpublished';
}

/**
 * The full presentation for a page's publication status: icon, colour classes,
 * label and tooltip. Call this from a template or a `$derived` — it reads the
 * i18n store, so the strings follow a language switch.
 */
export function pageStatus(page: PageStatusSource): PageStatusInfo {
	const key = pageStatusKey(page);
	const label = i18n.t(LABEL_KEYS[key]);

	let title = label;
	let date: string | undefined;

	if (key === 'scheduled') {
		date = formatStatusDate(page.publish_date);
		title = date ? i18n.t('ADMIN_NEXT.PAGES.STATUS.SCHEDULED_FOR', { date }) : label;
	} else if (key === 'expired') {
		date = formatStatusDate(page.unpublish_date);
		title = date ? i18n.t('ADMIN_NEXT.PAGES.STATUS.EXPIRED_ON', { date }) : label;
	}

	return { key, ...PRESENTATION[key], label, title, date };
}

/**
 * Title / accessible name for the publish toggle wrapping a marker: what the
 * button does, plus the state it is currently in. Folding both into the button
 * keeps the action discoverable on hover while still naming the date a
 * scheduled or expired page is waiting on.
 */
export function pageStatusToggleLabel(page: PageStatusSource, action: string): string {
	return i18n.t('ADMIN_NEXT.PAGES.STATUS.TOGGLE_TITLE', { action, status: pageStatus(page).title });
}
