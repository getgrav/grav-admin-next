import { api } from '../client';

export interface FloatingWidget {
	id: string;
	plugin: string;
	label: string;
	icon: string;
	priority?: number;
}

export async function getFloatingWidgets(): Promise<FloatingWidget[]> {
	return api.get<FloatingWidget[]>('/floating-widgets');
}
