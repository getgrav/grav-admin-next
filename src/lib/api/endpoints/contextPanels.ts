import { api } from '../client';

export interface ContextPanel {
	id: string;
	plugin: string;
	label: string;
	/** Lucide icon name (e.g., "history", "shield", "settings"). */
	icon: string;
	/** Contexts where the trigger button appears (e.g., ["pages"]). */
	contexts: string[];
	priority?: number;
	/** Panel width in pixels. Defaults to 420. */
	width?: number;
	/** API path returning { count: N } for badge display. Called with ?route=...&lang=... */
	badgeEndpoint?: string;
}

export async function getContextPanels(): Promise<ContextPanel[]> {
	return api.get<ContextPanel[]>('/context-panels');
}
