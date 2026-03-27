import { api } from '../client';

export interface BlueprintField {
	name: string;
	type: string;
	label?: string;
	help?: string;
	placeholder?: string;
	default?: unknown;
	description?: string;
	title?: string;
	text?: string;
	size?: string;
	disabled?: boolean;
	readonly?: boolean;
	toggleable?: boolean;
	highlight?: number;
	min?: number;
	max?: number;
	step?: number;
	minlength?: number;
	maxlength?: number;
	rows?: number;
	multiple?: boolean;
	markdown?: boolean;
	underline?: boolean;
	options?: Record<string, string>;
	validate?: {
		type?: string;
		required?: boolean;
		pattern?: string;
		min?: number;
		max?: number;
	};
	fields?: BlueprintField[];
	yaml?: boolean;
	accept?: string[];
	destination?: string;
}

export interface BlueprintSchema {
	name: string;
	title: string;
	type?: string;
	child_type?: string;
	validation: string;
	fields: BlueprintField[];
	defaults?: Record<string, unknown>;
}

export interface PageType {
	type: string;
	label: string;
}

export async function getPageTypes(): Promise<PageType[]> {
	return api.get<PageType[]>('/blueprints/pages');
}

export async function getPageBlueprint(template: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/pages/${template}`);
}

export async function getPluginBlueprint(plugin: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/plugins/${plugin}`);
}

export async function getThemeBlueprint(theme: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/themes/${theme}`);
}

export async function getConfigBlueprint(scope: string): Promise<BlueprintSchema> {
	return api.get<BlueprintSchema>(`/blueprints/config/${scope}`);
}
