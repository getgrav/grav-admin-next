import { api } from '../client';

export interface EnvironmentEntry {
	name: string;        // '' = base (user/config)
	label: string;
	exists: boolean;
	hasOverrides: boolean;
}

export interface EnvironmentList {
	detected: string;    // Grav-inferred from URL
	environments: EnvironmentEntry[];
}

export async function getEnvironments(): Promise<EnvironmentList> {
	return api.get<EnvironmentList>('/system/environments');
}

export async function createEnvironment(name: string): Promise<EnvironmentEntry> {
	return api.post<EnvironmentEntry>('/system/environments', { name });
}
