/**
 * Map Grav blueprint `size` values to Tailwind max-width classes.
 *
 * Grav sizes: x-small, small, medium, large (default = full width).
 */
export function fieldSizeClass(size?: string): string {
	switch (size) {
		case 'x-small':
			return 'max-w-24';
		case 'small':
			return 'max-w-48';
		case 'medium':
			return 'max-w-80';
		case 'large':
			return 'max-w-[28rem]';
		default:
			return '';
	}
}
