import { api } from '../client';

export interface FloatingWidget {
	id: string;
	plugin: string;
	label: string;
	/** Font Awesome icon name (e.g., "robot", "language", "bolt"). */
	icon: string;
	priority?: number;
	autoLoad?: boolean;
	showFab?: boolean;
	/**
	 * Admin-internal SPA routes this widget applies to (e.g. ["/users"]). When
	 * present, an autoLoad widget's script is only loaded on a matching route
	 * instead of everywhere (getgrav/grav-plugin-admin2#116). Omitted = load on
	 * every route (previous behaviour). Scopes script loading only — never a
	 * permission boundary.
	 */
	routes?: string[];
	/** FAB/header gradient (CSS gradient). Defaults to indigo/purple. */
	gradient?: string;
	/** Panel width in pixels. Defaults to 420. */
	width?: number;
	/** Panel height in pixels. Defaults to 580. */
	height?: number;
	/** If false, admin-next doesn't render a header — the widget provides its own chrome. Defaults to true. */
	useStandardHeader?: boolean;
}

export async function getFloatingWidgets(): Promise<FloatingWidget[]> {
	return api.get<FloatingWidget[]>('/floating-widgets');
}
