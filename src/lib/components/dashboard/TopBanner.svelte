<script lang="ts">
	import { onMount } from 'svelte';
	import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { dismissNotification } from '$lib/api/endpoints/dashboard-widgets';
	import { renderInlineMarkdown } from '$lib/dashboard/format';
	import type { Notification } from '$lib/api/endpoints/dashboard';

	let { notifications = [] }: { notifications?: Notification[] } = $props();

	const ROTATE_MS = 8000;

	let activeIdx = $state(0);
	let dismissed = $state<Set<number | string>>(new Set());
	let interval: ReturnType<typeof setInterval> | null = null;

	const visible = $derived(notifications.filter(n => !dismissed.has(n.id)));

	function next() { if (visible.length > 1) activeIdx = (activeIdx + 1) % visible.length; }
	function prev() { if (visible.length > 1) activeIdx = (activeIdx - 1 + visible.length) % visible.length; }

	function startRotation() {
		stopRotation();
		if (visible.length > 1) {
			interval = setInterval(next, ROTATE_MS);
		}
	}
	function stopRotation() {
		if (interval) { clearInterval(interval); interval = null; }
	}

	$effect(() => {
		if (activeIdx >= visible.length) activeIdx = 0;
		startRotation();
		return stopRotation;
	});

	async function close(notif: Notification) {
		// Optimistic — drop locally first
		dismissed = new Set([...dismissed, notif.id]);
		try {
			await dismissNotification(notif.id);
		} catch {
			// If the server rejects, the local hide still helps the session;
			// the next reload will pick up the canonical state.
		}
	}

	onMount(() => stopRotation);
</script>

{#if visible.length > 0}
	{@const current = visible[activeIdx]}
	<div
		class="relative mb-5 overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-fuchsia-500/5 to-transparent p-1"
		role="region"
		aria-label="Site notification"
		onmouseenter={stopRotation}
		onmouseleave={startRotation}
	>
		<div class="relative flex items-center gap-3 px-4 py-3 pr-24">
			{#if current.icon}
				<span class="shrink-0 text-lg leading-none">{current.icon}</span>
			{/if}
			<div class="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
				{#if current.title}
					<span class="font-semibold">{current.title}</span>
					<span class="mx-1 text-muted-foreground">—</span>
				{/if}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<span>{@html renderInlineMarkdown(current.message)}</span>
			</div>
			{#if current.action}
				<a
					href={current.action.url}
					target="_blank"
					rel="noopener noreferrer"
					class="shrink-0 rounded-md border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-[12px] font-semibold text-foreground transition-colors hover:bg-purple-500/20"
				>
					{current.action.label}
				</a>
			{/if}

			<div class="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
				{#if visible.length > 1}
					<div class="flex items-center gap-0.5 mr-1">
						<button
							type="button"
							class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={prev}
							title="Previous"
						>
							<ChevronLeft size={14} />
						</button>
						<span class="text-[10px] tabular-nums text-muted-foreground px-1">{activeIdx + 1}/{visible.length}</span>
						<button
							type="button"
							class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={next}
							title="Next"
						>
							<ChevronRight size={14} />
						</button>
					</div>
				{/if}
				<button
					type="button"
					class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => close(current)}
					title="Dismiss"
				>
					<X size={14} />
				</button>
			</div>
		</div>

		{#if visible.length > 1}
			<div class="absolute bottom-0 left-0 h-0.5 w-full bg-purple-500/10">
				<div class="h-full bg-purple-500/40" style="width: {((activeIdx + 1) / visible.length) * 100}%; transition: width 0.3s"></div>
			</div>
		{/if}
	</div>
{/if}
