import { toast } from 'svelte-sonner';

/**
 * Optional toast descriptor a plugin's API endpoint can return so it controls
 * the message shown after a save/action instead of the generic default.
 *
 * Success: returned in the `ApiResponse` body as a top-level `toast` object (or
 * a bare `message` string), e.g. `ApiResponse::create(['toast' => [...]])`.
 * Error: returned in the `ErrorResponse` problem+json body under `toast`.
 *
 * `duration` is milliseconds; pass `0` (or set `dismissible: true` with no
 * duration) for a toast that stays until the user closes it.
 */
export interface ToastHint {
	message?: string;
	type?: 'success' | 'error' | 'info' | 'warning';
	/** Milliseconds the toast stays visible. `0` = until manually dismissed. */
	duration?: number;
	/** When true (and no explicit duration), the toast persists until closed. */
	dismissible?: boolean;
}

/** A toast hint can arrive as a full object or a bare message string. */
type RawHint = ToastHint | string | null | undefined;

function normalize(hint: RawHint): ToastHint | undefined {
	if (hint == null) return undefined;
	if (typeof hint === 'string') return { message: hint };
	if (typeof hint === 'object' && typeof hint.message === 'string') return hint;
	return undefined;
}

/**
 * Pull a toast hint out of a save/action response payload. Honors a top-level
 * `toast` object first, then a bare `message` string (the convention
 * `executePluginPageAction` callers already rely on).
 */
export function extractToastHint(payload: unknown): ToastHint | undefined {
	if (!payload || typeof payload !== 'object') return undefined;
	const record = payload as Record<string, unknown>;
	return normalize((record.toast as RawHint) ?? (record.message as RawHint));
}

/**
 * Show a toast, letting a server-provided hint override the message, type and
 * duration while always falling back to the caller's default.
 */
export function showToastHint(
	hint: RawHint,
	fallback: { message: string; type?: 'success' | 'error' | 'info' | 'warning' },
): void {
	const normalized = normalize(hint);
	const message = normalized?.message ?? fallback.message;
	const type = normalized?.type ?? fallback.type ?? 'success';

	const options: { duration?: number } = {};
	if (normalized?.duration != null) {
		// sonner treats Infinity as "never auto-dismiss"; map an explicit 0 to it.
		options.duration = normalized.duration === 0 ? Infinity : normalized.duration;
	} else if (normalized?.dismissible) {
		options.duration = Infinity;
	}

	const emit = toast[type] ?? toast.message;
	emit(message, options);
}
