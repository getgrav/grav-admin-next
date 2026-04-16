import { api } from '../client';

/**
 * Admin-next settings panel, registered by a plugin via the
 * `onApiAdminSettingsPanels` event on the backend. Each panel renders
 * as a section card inside the Settings page and uses the same
 * blueprint/data/save flow as plugin pages.
 */
export interface SettingsPanel {
	id: string;
	/** Plugin slug that owns the blueprint file. */
	plugin: string;
	label: string;
	description?: string;
	icon?: string;
	blueprint: string;
	data_endpoint: string;
	save_endpoint: string;
	priority?: number;
}

export async function getSettingsPanels(): Promise<SettingsPanel[]> {
	return api.get<SettingsPanel[]>('/settings/panels');
}
