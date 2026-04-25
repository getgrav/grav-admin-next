import type { DashboardLayout } from './types';

export interface PresetDef {
	id: 'default' | 'minimal' | 'compact';
	label: string;
	description: string;
	apply(): DashboardLayout;
}

export const PRESETS: PresetDef[] = [
	{
		id: 'default',
		label: 'Default',
		description: 'Balanced layout with all main widgets visible.',
		apply(): DashboardLayout {
			return {
				preset: 'default',
				widgets: [
					{ id: 'core.stats', visible: true, size: 'xl', order: 1 },
					{ id: 'core.popularity', visible: true, size: 'lg', order: 2 },
					{ id: 'core.system-health', visible: true, size: 'sm', order: 3 },
					{ id: 'core.recent-pages', visible: true, size: 'md', order: 4 },
					{ id: 'core.top-pages', visible: true, size: 'sm', order: 5 },
					{ id: 'core.backups', visible: true, size: 'sm', order: 6 },
					{ id: 'core.notifications', visible: true, size: 'md', order: 7 },
					{ id: 'core.news-feed', visible: true, size: 'md', order: 8 },
				],
			};
		},
	},
	{
		id: 'minimal',
		label: 'Minimal',
		description: 'Stats and recent pages only.',
		apply(): DashboardLayout {
			return {
				preset: 'minimal',
				widgets: [
					{ id: 'core.stats', visible: true, size: 'xl', order: 1 },
					{ id: 'core.recent-pages', visible: true, size: 'md', order: 2 },
					{ id: 'core.popularity', visible: false, order: 99 },
					{ id: 'core.system-health', visible: false, order: 99 },
					{ id: 'core.top-pages', visible: false, order: 99 },
					{ id: 'core.backups', visible: false, order: 99 },
					{ id: 'core.notifications', visible: false, order: 99 },
					{ id: 'core.news-feed', visible: false, order: 99 },
				],
			};
		},
	},
	{
		id: 'compact',
		label: 'Compact',
		description: 'All widgets at the smallest size each supports.',
		apply(): DashboardLayout {
			return {
				preset: 'compact',
				widgets: [
					{ id: 'core.stats', visible: true, size: 'md', order: 1 },
					{ id: 'core.popularity', visible: true, size: 'md', order: 2 },
					{ id: 'core.system-health', visible: true, size: 'md', order: 3 },
					{ id: 'core.recent-pages', visible: true, size: 'sm', order: 4 },
					{ id: 'core.top-pages', visible: true, size: 'sm', order: 5 },
					{ id: 'core.backups', visible: true, size: 'sm', order: 6 },
					{ id: 'core.notifications', visible: true, size: 'sm', order: 7 },
					{ id: 'core.news-feed', visible: true, size: 'sm', order: 8 },
				],
			};
		},
	},
];

export function getPreset(id: string): PresetDef | undefined {
	return PRESETS.find(p => p.id === id);
}
