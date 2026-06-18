import { api } from '../client';

export interface MenubarItem {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	/** Server action key — POSTed to /menubar/actions/{plugin}/{action} when clicked. */
	action: string;
	confirm?: string;
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
