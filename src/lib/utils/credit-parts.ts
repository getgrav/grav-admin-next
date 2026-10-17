export type CreditPart = { text: string; slot?: undefined } | { slot: string; text?: undefined };

const MARK = '\u0000';

/**
 * Splits a translated sentence around its placeholders, so the markup that
 * goes in each one (an icon, a link) lands wherever the translation puts it.
 * Each placeholder is passed through the translator as a marker, then the
 * result is split on the markers. A translation that leaves a placeholder
 * out simply has no part for it.
 */
export function creditParts(
	t: (key: string, params?: Record<string, string>) => string,
	key: string,
	slots: string[],
): CreditPart[] {
	const params = Object.fromEntries(slots.map((s) => [s, `${MARK}${s}${MARK}`]));
	return t(key, params)
		.split(MARK)
		.map((piece, i): CreditPart => (i % 2 === 1 && slots.includes(piece) ? { slot: piece } : { text: piece }))
		.filter((part) => part.slot !== undefined || part.text !== '');
}
