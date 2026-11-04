import { i18n } from '$lib/stores/i18n.svelte';
import { ApiRequestError } from '$lib/api/client';

/**
 * What a package text is: its README, its changelog, or what its available
 * update changes (the changelog entries newer than the installed version).
 */
export type PackageTextKind = 'readme' | 'changelog' | 'update';

export interface PackageTextRequest {
	kind: PackageTextKind;
	/** The modal title. A function, so it follows a language change. */
	title: () => string;
	/** Fetches the markdown to show, formatted. */
	load: () => Promise<string>;
}

/**
 * State for the modal a page shows a package's README or changelog in, for
 * MarkdownModal: `open`, `title`, `content` and `close`.
 *
 * The buttons that open it share it: a slow answer for one must not land in it
 * after another has been opened. The title and the messages are read when the
 * modal shows them, so they follow a language change. For an update the API
 * answers 404 when it has no entries to show (none newer than the installed
 * version, but also no changelog in the feed, no feed entry, or an installed
 * version it can't read); that reads as "no entries", not as a failure.
 */
export function createTextModal() {
	let open = $state(false);
	let request = $state<PackageTextRequest | null>(null);
	let loading = $state(false);
	let markdown = $state('');
	let problem = $state<'empty' | 'failed' | null>(null);
	let latest = 0;

	function problemText(kind: PackageTextKind, issue: 'empty' | 'failed'): string {
		if (kind === 'update') {
			return i18n.t(issue === 'empty' ? 'ADMIN_NEXT.UPDATE_CHANGELOG_EMPTY' : 'ADMIN_NEXT.UPDATE_CHANGELOG_FAILED');
		}
		return i18n.t(kind === 'readme' ? 'ADMIN_NEXT.README_NOT_AVAILABLE' : 'ADMIN_NEXT.CHANGELOG_NOT_AVAILABLE');
	}

	async function show(next: PackageTextRequest): Promise<void> {
		const id = ++latest;
		request = next;
		loading = true;
		markdown = '';
		problem = null;
		open = true;
		let text = '';
		let issue: 'empty' | 'failed' | null = null;
		try {
			text = await next.load();
			if (text.trim() === '') issue = 'empty';
		} catch (err) {
			const notFound = err instanceof ApiRequestError && err.response.status === 404;
			issue = next.kind === 'update' && notFound ? 'empty' : 'failed';
		}
		if (id !== latest) return;
		markdown = text;
		problem = issue;
		loading = false;
	}

	return {
		get open() {
			return open;
		},
		get title() {
			return request?.title() ?? '';
		},
		get content() {
			if (loading) return i18n.t('ADMIN_NEXT.LOADING');
			if (problem && request) return `*${problemText(request.kind, problem)}*`;
			return markdown;
		},
		show,
		close() {
			open = false;
		},
	};
}
