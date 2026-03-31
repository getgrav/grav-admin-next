/**
 * Map Grav blueprint `size` values to Tailwind max-width classes.
 *
 * Grav sizes: x-small, small, medium, large (default = full width).
 */
export function fieldSizeClass(size?: string): string {
	switch (size) {
		case 'x-small':
			return 'max-w-20';
		case 'small':
			return 'max-w-40';
		case 'medium':
			return 'max-w-64';
		case 'large':
			return 'max-w-96';
		default:
			return '';
	}
}
