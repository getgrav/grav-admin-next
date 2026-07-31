/**
 * Remembers the tab a blueprint form was last left on (admin2#144).
 *
 * Editing the same field across many pages means opening page after page and
 * hunting for the same tab every time. Classic admin solved this with a
 * `grav-tabs-state` cookie keyed by the tabs' field names, so any form sharing
 * that tab layout reopened where you left off. This is the same idea, minus
 * the cookie: the group key is the tab names, and an explicit URL hash always
 * takes precedence so deep links still land where they point.
 *
 * localStorage rather than sessionStorage on purpose: a new tab opened with
 * Cmd+Click does not inherit sessionStorage in current browsers, and opening
 * pages in new tabs is exactly the workflow this exists to serve.
 */

import { scopedKey } from './scopedStorage';

const STORE_KEY = 'grav_admin_tab_memory';

type TabMemory = Record<string, string>;

function read(): TabMemory {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(scopedKey(STORE_KEY));
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed && typeof parsed === 'object' ? (parsed as TabMemory) : {};
	} catch {
		return {};
	}
}

/** Name of the tab this group was last left on, lowercased, or null. */
export function recallTab(group: string): string | null {
	if (!group) return null;
	return read()[group] ?? null;
}

export function rememberTab(group: string, tabName: string): void {
	if (typeof window === 'undefined' || !group) return;
	try {
		const memory = read();
		memory[group] = tabName;
		localStorage.setItem(scopedKey(STORE_KEY), JSON.stringify(memory));
	} catch {
		/* quota exceeded or storage disabled — tab memory is a nicety, not a requirement */
	}
}
