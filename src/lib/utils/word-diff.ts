// Lightweight word-level text diff for the audit-trail change viewer.
//
// Self-contained (no jsdiff dependency): tokenizes both sides into word/space
// runs and walks an LCS table to classify each token as unchanged, added, or
// removed. Audit content is server-capped (a few KB), so the O(n·m) table is
// small and this runs on-demand when a single row is expanded.

export type DiffOp = 'same' | 'added' | 'removed';

export interface DiffSegment {
	type: DiffOp;
	text: string;
}

/** Split into an alternating stream of non-space and space runs, so the
 *  original text (including newlines) reconstructs exactly. */
function tokenize(text: string): string[] {
	return text.match(/\s+|\S+/g) ?? [];
}

/**
 * Produce a merged list of diff segments between two strings. Equal runs are
 * `same`; tokens only in `oldText` are `removed`; tokens only in `newText` are
 * `added`. Adjacent segments of the same type are merged for compact rendering.
 */
export function wordDiff(oldText: string, newText: string): DiffSegment[] {
	const a = tokenize(oldText ?? '');
	const b = tokenize(newText ?? '');
	const n = a.length;
	const m = b.length;

	// LCS length table.
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	// Backtrack into ordered ops.
	const raw: DiffSegment[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			raw.push({ type: 'same', text: a[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			raw.push({ type: 'removed', text: a[i] });
			i++;
		} else {
			raw.push({ type: 'added', text: b[j] });
			j++;
		}
	}
	while (i < n) raw.push({ type: 'removed', text: a[i++] });
	while (j < m) raw.push({ type: 'added', text: b[j++] });

	// Merge adjacent same-type runs.
	const merged: DiffSegment[] = [];
	for (const seg of raw) {
		const last = merged[merged.length - 1];
		if (last && last.type === seg.type) last.text += seg.text;
		else merged.push({ ...seg });
	}
	return merged;
}

/** True when the two sides differ (used to decide whether to render a diff). */
export function hasTextChange(oldText: unknown, newText: unknown): boolean {
	return String(oldText ?? '') !== String(newText ?? '');
}

// ── Line-level diff with collapsed context ──────────────────────────────────
//
// For multi-line content, a full word diff drowns one changed sentence in the
// whole page body. Instead we diff by line, then keep only the changed lines
// plus a few lines of context, collapsing each unchanged gap into a marker,
// the way a code review tool shows a hunk. A line that was replaced (a delete
// immediately followed by an add) is shown as an inline word diff so small
// edits still highlight at the word level.

export type RowType = 'same' | 'add' | 'del' | 'replace' | 'gap';

export interface DiffRow {
	type: RowType;
	/** Line text for same/add/del. */
	text?: string;
	/** Word-level segments for a replaced line. */
	segs?: DiffSegment[];
	/** Number of hidden lines for a gap row. */
	count?: number;
}

/** LCS line ops between two line arrays. */
function lineOps(a: string[], b: string[]): { type: 'same' | 'del' | 'add'; text: string }[] {
	const n = a.length;
	const m = b.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const ops: { type: 'same' | 'del' | 'add'; text: string }[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) ops.push({ type: 'same', text: a[i++] }), j++;
		else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ type: 'del', text: a[i++] });
		else ops.push({ type: 'add', text: b[j++] });
	}
	while (i < n) ops.push({ type: 'del', text: a[i++] });
	while (j < m) ops.push({ type: 'add', text: b[j++] });
	return ops;
}

/** Pair each delete-run with the following add-run line-for-line into `replace`
 *  rows (inline word diff), leaving any surplus as plain add/del rows. */
function pairRows(ops: { type: 'same' | 'del' | 'add'; text: string }[]): DiffRow[] {
	const rows: DiffRow[] = [];
	let k = 0;
	while (k < ops.length) {
		if (ops[k].type === 'del') {
			const dels: string[] = [];
			while (k < ops.length && ops[k].type === 'del') dels.push(ops[k++].text);
			const adds: string[] = [];
			while (k < ops.length && ops[k].type === 'add') adds.push(ops[k++].text);
			const pairs = Math.min(dels.length, adds.length);
			for (let p = 0; p < pairs; p++) rows.push({ type: 'replace', segs: wordDiff(dels[p], adds[p]) });
			for (let p = pairs; p < dels.length; p++) rows.push({ type: 'del', text: dels[p] });
			for (let p = pairs; p < adds.length; p++) rows.push({ type: 'add', text: adds[p] });
		} else if (ops[k].type === 'add') {
			rows.push({ type: 'add', text: ops[k++].text });
		} else {
			rows.push({ type: 'same', text: ops[k++].text });
		}
	}
	return rows;
}

/** Collapse runs of unchanged lines, keeping `ctx` lines of context next to a
 *  change and replacing the rest with a single `gap` row. */
function collapse(rows: DiffRow[], ctx: number): DiffRow[] {
	const out: DiffRow[] = [];
	let i = 0;
	while (i < rows.length) {
		if (rows[i].type !== 'same') {
			out.push(rows[i++]);
			continue;
		}
		let j = i;
		while (j < rows.length && rows[j].type === 'same') j++;
		const run = rows.slice(i, j);
		const head = i === 0 ? 0 : ctx; // lines kept after the preceding change
		const tail = j === rows.length ? 0 : ctx; // lines kept before the next change
		if (run.length <= head + tail) {
			out.push(...run);
		} else {
			out.push(...run.slice(0, head), { type: 'gap', count: run.length - head - tail }, ...run.slice(run.length - tail));
		}
		i = j;
	}
	return out;
}

/**
 * Line diff between two strings, with unchanged regions collapsed to `ctx`
 * lines of context. Single-line fields collapse to one inline word-diff row.
 */
export function collapsedLineDiff(oldText: string, newText: string, ctx = 2): DiffRow[] {
	const ops = lineOps(String(oldText ?? '').split('\n'), String(newText ?? '').split('\n'));
	return collapse(pairRows(ops), ctx);
}
