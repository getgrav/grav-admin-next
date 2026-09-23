/**
 * JSON with object keys sorted at every level, so two values that are equal
 * serialize the same way whatever order their keys arrived in. Used to tell
 * whether a polled payload actually changed.
 */
export function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) => {
		if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
		const sorted: Record<string, unknown> = {};
		for (const k of Object.keys(v as Record<string, unknown>).sort()) {
			sorted[k] = (v as Record<string, unknown>)[k];
		}
		return sorted;
	});
}
