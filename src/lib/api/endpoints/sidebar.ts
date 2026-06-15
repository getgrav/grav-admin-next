import { api } from '../client';

export interface SidebarItem {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	route: string;
	priority?: number;
	/** Static badge text/count. Overridden by a live value when `badgeEndpoint` is set. */
	badge?: string | number | null;
	/** API path returning `{ count: N }` for a dynamically-refreshed badge. */
	badgeEndpoint?: string;
}

export async function getSidebarItems(): Promise<SidebarItem[]> {
	return api.get<SidebarItem[]>('/sidebar/items');
}
