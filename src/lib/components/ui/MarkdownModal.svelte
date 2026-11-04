<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { X } from 'lucide-svelte';

	interface Props {
		open: boolean;
		title: string;
		content: string;
		onclose: () => void;
	}

	let { open, title, content, onclose }: Props = $props();

	const html = $derived(content ? renderMarkdown(content) : '');

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm sm:p-8"
		onclick={handleBackdrop}
	>
		<div class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
			<!-- Header (fixed) -->
			<div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
				<h2 class="text-lg font-semibold text-foreground">{title}</h2>
				<button
					type="button"
					class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={onclose}
				>
					<X size={16} />
				</button>
			</div>

			<!-- Content (scrollable) -->
			<div class="markdown-content prose prose-sm dark:prose-invert max-w-none overflow-y-auto px-6 py-5">
				<!-- eslint-disable-next-line grav/no-unsanitized-html -- html is renderMarkdown() output, sanitized where it is derived -->
				{@html html}
			</div>
		</div>
	</div>
{/if}

<style>
	/* The content area has its own padding, so the top margin of a leading heading
	   (a changelog starts with `# v1.2.3`) only added empty space under the header.
	   Later headings keep theirs: it separates one version from the next. */
	.markdown-content > :global(:first-child) {
		margin-top: 0;
	}

	/* A changelog (see formatChangelog in utils/gpm.ts): each version is a
	   heading with its date beside it, each section a labelled badge over its
	   list, and a security fix carries a small tag. The colours come with the
	   badge from formatChangelog; the layout lives here. */
	:global(.prose h2.changelog-version) {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.625rem;
		margin: 1.75rem 0 0;
		padding-top: 1.25rem;
		border-top: 1px solid var(--color-border, hsl(240 5.9% 90%));
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.4;
		font-variant-numeric: tabular-nums;
	}
	.markdown-content > :global(h2.changelog-version:first-child) {
		padding-top: 0;
		border-top: 0;
	}
	:global(.prose .changelog-date) {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--color-muted-foreground, hsl(240 3.8% 46.1%));
	}
	:global(.prose .changelog-badge) {
		display: inline-flex;
		align-items: center;
		margin-top: 0.875rem;
		border-radius: 0.375rem;
		padding: 0.125rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 600;
		line-height: 1.25rem;
	}
	:global(.prose .changelog-badge + ul) {
		margin-top: 0.375rem;
	}
	:global(.prose .changelog-badge + ul > li) {
		margin-top: 0.25rem;
		margin-bottom: 0.25rem;
	}
	:global(.prose .changelog-tag) {
		display: inline-block;
		margin-inline-end: 0.125rem;
		border: 1px solid color-mix(in oklab, var(--color-destructive) 40%, transparent);
		border-radius: 0.25rem;
		padding: 0 0.375rem;
		font-size: 0.625rem;
		font-weight: 600;
		line-height: 1rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		vertical-align: 0.1em;
		color: var(--color-destructive);
	}

	/* Prose styling for rendered markdown */
	:global(.prose) {
		line-height: 1.7;
	}
	:global(.prose h1) {
		font-size: 1.5rem;
		font-weight: 700;
		margin-top: 1.5rem;
		margin-bottom: 0.5rem;
		color: var(--color-foreground, hsl(240 10% 3.9%));
		border-bottom: 1px solid var(--color-border, hsl(240 5.9% 90%));
		padding-bottom: 0.5rem;
	}
	:global(.prose h2) {
		font-size: 1.15rem;
		font-weight: 600;
		margin-top: 1.25rem;
		margin-bottom: 0.25rem;
		color: var(--color-foreground, hsl(240 10% 3.9%));
	}
	:global(.prose h3) {
		font-size: 1rem;
		font-weight: 600;
		margin-top: 1rem;
		margin-bottom: 0.25rem;
		color: var(--color-foreground, hsl(240 10% 3.9%));
	}
	:global(.prose p) {
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
	}
	:global(.prose ul) {
		margin-top: 0.25rem;
		margin-bottom: 0.5rem;
		padding-left: 1.25rem;
		list-style-type: disc;
	}
	:global(.prose ol) {
		margin-top: 0.25rem;
		margin-bottom: 0.5rem;
		padding-left: 1.25rem;
		list-style-type: decimal;
	}
	:global(.prose li) {
		margin-top: 0.1rem;
		margin-bottom: 0.1rem;
	}
	:global(.prose code) {
		font-size: 0.85em;
		background: var(--color-muted, hsl(240 4.8% 95.9%));
		padding: 0.15em 0.35em;
		border-radius: 4px;
	}
	:global(.prose pre) {
		background: var(--color-muted, hsl(240 4.8% 95.9%));
		padding: 0.75rem 1rem;
		border-radius: 8px;
		overflow-x: auto;
		margin: 0.5rem 0;
	}
	:global(.prose pre code) {
		background: none;
		padding: 0;
	}
	:global(.prose a) {
		color: var(--color-primary, hsl(221 83% 53%));
		text-decoration: none;
	}
	:global(.prose a:hover) {
		text-decoration: underline;
	}
	:global(.prose blockquote) {
		border-left: 3px solid var(--color-border, hsl(240 5.9% 90%));
		padding-left: 1rem;
		color: var(--color-muted-foreground, hsl(240 3.8% 46.1%));
		margin: 0.5rem 0;
	}
	:global(.prose hr) {
		border: none;
		border-top: 1px solid var(--color-border, hsl(240 5.9% 90%));
		margin: 1rem 0;
	}
	:global(.prose img) {
		max-width: 100%;
		border-radius: 6px;
	}
</style>
