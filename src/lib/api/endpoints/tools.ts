import { api } from '../client';
import { auth } from '$lib/stores/auth.svelte';

// ── Backups ──

export interface Backup {
	filename: string;
	title: string | null;
	date: string | null;
	size: number;
}

export interface PurgeConfig {
	trigger: 'space' | 'number' | 'time';
	max_backups_count: number;
	max_backups_space: number;
	max_backups_time: number;
}

export interface BackupsResponse {
	backups: Backup[];
	purge: PurgeConfig;
	profiles_count: number;
}

export interface BackupCreated {
	filename: string;
	path: string;
	size: number;
	date: string;
}

export async function getBackups(): Promise<BackupsResponse> {
	return api.get<BackupsResponse>('/system/backups');
}

export async function createBackup(): Promise<BackupCreated> {
	return api.post<BackupCreated>('/system/backup');
}

export async function deleteBackup(filename: string): Promise<void> {
	return api.delete<void>(`/system/backups/${encodeURIComponent(filename)}`);
}

export function getBackupDownloadUrl(filename: string): string {
	const base = `${auth.serverUrl}${auth.apiPrefix || '/api/v1'}`;
	return `${base}/system/backups/${encodeURIComponent(filename)}/download?token=${auth.accessToken}`;
}

// ── Scheduler ──

export interface SchedulerHealth {
	status: 'healthy' | 'warning' | 'error';
	message?: string;
	last_run: string | null;
	last_run_age: number | null;
	scheduled_jobs: number;
	jobs_due: number;
	queue_size: number;
	webhook_enabled: boolean;
}

export interface SchedulerStatus {
	crontab_status: 'not_installed' | 'installed' | 'error';
	cron_command: string;
	scheduler_command: string;
	whoami: string;
	health: SchedulerHealth;
	triggers: string[];
	webhook_installed: boolean;
	webhook_enabled: boolean;
}

export interface SchedulerJob {
	id: string;
	command: string;
	expression: string;
	enabled: boolean;
	status: string;
	last_run: string | null;
	error: string | null;
}

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
	return api.get<SchedulerStatus>('/scheduler/status');
}

export async function getSchedulerJobs(): Promise<SchedulerJob[]> {
	return api.get<SchedulerJob[]>('/scheduler/jobs');
}

export async function runScheduler(force = false): Promise<{ message: string }> {
	return api.post<{ message: string }>('/scheduler/run', { force });
}

// ── Logs ──

export interface LogEntry {
	date: string;
	logger: string;
	level: string;
	message: string;
}

export interface LogsResponse {
	data: LogEntry[];
	meta: {
		pagination: {
			total: number;
			page: number;
			per_page: number;
			total_pages: number;
		};
	};
}

export async function getLogs(params: {
	page?: number;
	per_page?: number;
	level?: string;
	search?: string;
}): Promise<LogsResponse> {
	const qp: Record<string, string> = {};
	if (params.page) qp.page = String(params.page);
	if (params.per_page) qp.per_page = String(params.per_page);
	if (params.level) qp.level = params.level;
	if (params.search) qp.search = params.search;
	return api.getFullBody<LogsResponse>('/system/logs', qp);
}

// ── System Info ──

export interface SystemInfoData {
	php: {
		version: string;
		sapi: string;
		extensions: string[];
		memory_limit: string;
		max_execution_time: string;
		upload_max_filesize: string;
		post_max_size: string;
	};
	grav: {
		version: string;
		php_version: string;
	};
	disk: {
		free_space: number;
		total_space: number;
	};
	plugins: {
		total: number;
		enabled: number;
		disabled: number;
	};
	cache: {
		enabled: boolean;
		driver: string;
	};
}

export async function getSystemInfo(): Promise<SystemInfoData> {
	return api.get<SystemInfoData>('/systeminfo');
}

// ── Reports ──

export interface ReportItem {
	id: string;
	title: string;
	provider: string;
	component: string | null;
	status: 'success' | 'warning' | 'error';
	message: string;
	items: Record<string, unknown>[];
}

export async function getReports(): Promise<ReportItem[]> {
	return api.get<ReportItem[]>('/reports');
}

// ── Direct Install ──

export async function directInstallUrl(url: string): Promise<{ message: string }> {
	return api.post<{ message: string }>('/gpm/direct-install', { url });
}

export async function directInstallFile(file: File): Promise<{ message: string }> {
	return api.uploadFile<{ message: string }>('/gpm/direct-install', file, {
		fieldName: 'file',
	});
}
