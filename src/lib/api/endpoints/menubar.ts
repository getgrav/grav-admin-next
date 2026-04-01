import { api } from '../client';

export interface MenubarItem {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	action: string;
	confirm?: string;
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
