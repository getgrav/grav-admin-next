import { api } from '../client';

export interface SidebarItem {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	route: string;
	priority?: number;
	badge?: string | number | null;
}

export async function getSidebarItems(): Promise<SidebarItem[]> {
	return api.get<SidebarItem[]>('/sidebar/items');
}
