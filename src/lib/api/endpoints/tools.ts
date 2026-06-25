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

export interface LogFile {
	file: string;
	label: string;
}

export interface LogFilesResponse {
	files: LogFile[];
	default: string;
}

export async function getLogFiles(): Promise<LogFilesResponse> {
	return api.get<LogFilesResponse>('/system/logs/files');
}

export async function getLogs(params: {
	page?: number;
	per_page?: number;
	level?: string;
	search?: string;
	file?: string;
}): Promise<LogsResponse> {
	const qp: Record<string, string> = {};
	if (params.page) qp.page = String(params.page);
	if (params.per_page) qp.per_page = String(params.per_page);
	if (params.level) qp.level = params.level;
	if (params.search) qp.search = params.search;
	if (params.file) qp.file = params.file;
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
	meta?: Record<string, unknown>;
	items: Record<string, unknown>[];
}

export async function getReports(): Promise<ReportItem[]> {
	return api.get<ReportItem[]>('/reports');
}

// ── Twig in Content report ──

export interface TwigContentMeta {
	gate: boolean;
	sandbox: boolean;
	xss_scan: boolean;
	editor_enabled: boolean;
	leak_count: number;
	event_count: number;
}

/** "Add to allowlist" descriptor attached to a sandbox-block report row. */
export interface TwigAllowlistTarget {
	rule: 'tag' | 'filter' | 'function' | 'method' | 'property';
	key: string;
	kind: 'list' | 'map';
	token: string;
	class: string;
}

export interface TwigContentLeakItem {
	kind: 'leak';
	route: string;
	reason: 'gate_off' | 'page_off';
	requested: boolean;
}

export interface TwigContentEventItem {
	kind: 'event';
	type: string;
	route: string;
	token: string;
	class: string;
	hint: string;
	timestamp: number;
	allowlist: TwigAllowlistTarget | null;
}

export type TwigContentItem = TwigContentLeakItem | TwigContentEventItem;

/** Append a blocked token to the matching Twig sandbox allowlist. Super-only. */
export async function addTwigAllowlist(
	target: Pick<TwigAllowlistTarget, 'rule' | 'token' | 'class'>,
): Promise<{ rule: string; key: string; value: unknown }> {
	return api.post('/reports/twig-content/allowlist', {
		rule: target.rule,
		token: target.token,
		class: target.class,
	});
}

/** Clear the recent Twig-content diagnostics events ring buffer. */
export async function clearTwigContentEvents(): Promise<{ cleared: boolean }> {
	return api.delete('/reports/twig-content/events');
}

export interface TwigContentLeak {
	route: string;
	requested: boolean;
	gate: boolean;
	reason: 'gate_off' | 'page_off';
}

export interface TwigContentPageStatus {
	route: string;
	gate: boolean;
	sandbox: boolean;
	leak: TwigContentLeak | null;
	events: TwigContentEventItem[];
}

/** Per-page Twig-in-content status for the page-editor banner. */
export async function getTwigContentPageStatus(route: string): Promise<TwigContentPageStatus> {
	return api.get(`/reports/twig-content/page?route=${encodeURIComponent(route)}`);
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
