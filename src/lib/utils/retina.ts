/**
 * Text for an image's retina scales, as the media API reports them in
 * `retina` (e.g. [2, 3] for photo@2x.jpg and photo@3x.jpg).
 *
 * Compact form for badges: up to three scales are listed (`@2x @3x`), a longer
 * run shows its range (`@2x–@10x`). The full form lists every scale.
 */
export function retinaLabel(scales: number[] | undefined, full = false): string {
	const list = [...new Set((scales ?? []).filter((s) => Number.isInteger(s) && s >= 2))].sort((a, b) => a - b);
	if (list.length === 0) return '';
	if (full) return list.map((s) => `@${s}x`).join(', ');
	if (list.length <= 3) return list.map((s) => `@${s}x`).join(' ');
	return `@${list[0]}x–@${list[list.length - 1]}x`;
}
