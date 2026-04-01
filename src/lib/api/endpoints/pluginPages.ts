import { api } from '../client';
import type { BlueprintSchema } from './blueprints';

export interface PluginPageAction {
	id: string;
	label: string;
	icon?: string;
	method?: string;
	endpoint?: string;
	primary?: boolean;
	upload?: boolean;
	download?: boolean;
	confirm?: string;
}

export interface PluginPageDefinition {
	id: string;
	plugin: string;
	title: string;
	icon?: string;
	page_type: 'blueprint' | 'component';
	blueprint?: string;
	data_endpoint?: string;
	save_endpoint?: string;
	actions?: PluginPageAction[];
	has_custom_component?: boolean;
}

export async function getPluginPageDefinition(slug: string): Promise<PluginPageDefinition> {
	return api.get<PluginPageDefinition>(`/gpm/plugins/${slug}/page`);
}

export async function getPluginPageBlueprint(plugin: string, pageId: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/plugins/${plugin}/pages/${pageId}`);
}

export async function getPluginPageData(endpoint: string): Promise<Record<string, unknown>> {
	return api.get<Record<string, unknown>>(endpoint);
}

export async function savePluginPageData(endpoint: string, data: Record<string, unknown>): Promise<void> {
	await api.patch(endpoint, data);
}
