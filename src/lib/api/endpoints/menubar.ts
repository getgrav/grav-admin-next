import { api } from '../client';

/**
 * Visual emphasis for a menubar item. Maps to admin-next theme tokens (never a
 * raw color), so items stay readable in light and dark and follow the active
 * theme. Omit for the default muted icon button.
 */
export type MenubarItemVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export interface MenubarItem {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	/** Server action key — POSTed to /menubar/actions/{plugin}/{action} when clicked. */
	action: string;
	confirm?: string;
	/** Color emphasis. Defaults to a muted, icon-only button. */
	variant?: MenubarItemVariant;
	/**
	 * Render the `label` text beside the icon instead of using it only as a
	 * tooltip. Turns a 28px icon into a readable labelled button — the fix for
	 * "find Waldo" custom buttons (admin2#67).
	 */
	showLabel?: boolean;
	/** Button size. `sm` (default) is a compact icon; `md` is taller with roomier padding. */
	size?: 'sm' | 'md';
	/**
	 * Client-side intent (overrides the server `action`):
	 * `route` navigates the SPA (e.g. `/pages/new?parent=/blog&template=item`);
	 * `modal` opens a plugin modal web component.
	 */
	route?: string;
	modal?: {
		component: string;
		title?: string;
		props?: Record<string, unknown>;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		useStandardHeader?: boolean;
	};
}

export async function getMenubarItems(): Promise<MenubarItem[]> {
	return api.get<MenubarItem[]>('/menubar/items');
}

export async function executeMenubarAction(
	plugin: string,
	action: string,
	body?: Record<string, unknown>,
): Promise<{ status: string; message: string }> {
	return api.post<{ status: string; message: string }>(
		`/menubar/actions/${plugin}/${action}`,
		body,
	);
}
