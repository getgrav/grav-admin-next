import { api } from '../client';

/** A shortcut a user can star to show under its item. */
export interface SidebarChild {
	id: string;
	label: string;
	route: string;
	/** Shown until the user picks their own shortcuts. */
	default?: boolean;
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
	/** Shortcuts the user can star to show under this item. */
	children?: SidebarChild[];
}

export async function getSidebarItems(): Promise<SidebarItem[]> {
	return api.get<SidebarItem[]>('/sidebar/items');
}
