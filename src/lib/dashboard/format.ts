export function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString();
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

import { marked } from 'marked';
import { renderMarkdownInline } from '$lib/utils/markdown';

const inlineRenderer = new marked.Renderer();
inlineRenderer.link = ({ href, title, text }) =>
	`<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;

// Render a short message string as inline HTML (bold/italic/code/link only — no block tags).
// Sanitized via the shared helper; the raw href above is defused by DOMPurify there.
export function renderInlineMarkdown(text: string): string {
	return renderMarkdownInline(text, inlineRenderer);
}
