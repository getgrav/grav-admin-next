import { api } from '../client';

/** A shortcut a user can switch on under its item. */
export interface SidebarChild {
	id: string;
	label: string;
	route: string;
	icon?: string;
}

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
	/** Shortcuts the user can add under this item when customizing the sidebar. */
	children?: SidebarChild[];
}

export async function getSidebarItems(): Promise<SidebarItem[]> {
	return api.get<SidebarItem[]>('/sidebar/items');
}
