export type WidgetSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface WidgetDef {
	id: string;
	source: 'core' | 'plugin';
	plugin?: string;
	label: string;
	icon: string;
	sizes: WidgetSize[];
	defaultSize: WidgetSize;
	scriptUrl?: string;
	dataEndpoint?: string;
	priority?: number;
}

export interface ResolvedWidget extends WidgetDef {
	visible: boolean;
	size: WidgetSize;
	order: number;
}

export interface DashboardLayout {
	preset: 'default' | 'minimal' | 'compact' | 'custom';
	widgets: Array<{
		id: string;
		visible?: boolean;
		size?: WidgetSize | null;
		order?: number;
	}>;
}

export interface DashboardWidgetsResponse {
	widgets: ResolvedWidget[];
	user_layout: Partial<DashboardLayout>;
	site_layout: Partial<DashboardLayout>;
	can_edit_site: boolean;
}
