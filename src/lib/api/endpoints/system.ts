import { api } from '../client';

export interface SystemInfo {
	grav_version: string;
	php_version: string;
	server_name: string;
	server_software: string;
	memory_limit: string;
	max_execution_time: number;
	upload_max_filesize: string;
	post_max_size: string;
	timezone: string;
	extensions: string[];
}

export interface Environment {
	name: string;
	hostname: string;
	current: boolean;
}

export async function getSystemInfo(): Promise<SystemInfo> {
	return api.get<SystemInfo>('/system/info');
}

export async function getEnvironments(): Promise<Environment[]> {
	return api.get<Environment[]>('/system/environments');
}

export async function clearCache(): Promise<{ message: string }> {
	return api.post<{ message: string }>('/system/cache/clear');
}
