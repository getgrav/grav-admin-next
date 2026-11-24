<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { X } from 'lucide-svelte';
	import NamedLucideIcon from '$lib/components/ui/NamedLucideIcon.svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { dismissNotification } from '$lib/api/endpoints/dashboard-widgets';
	import { renderInlineMarkdown } from '$lib/dashboard/format';
	import type { Notification, NotificationButton } from '$lib/api/endpoints/dashboard';
	import { saveConfig } from '$lib/api/endpoints/config';
	import { auth } from '$lib/stores/auth.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { toast } from 'svelte-sonner';

	let { notifications = [] }: { notifications?: Notification[] } = $props();

	// A notification `icon` may be an emoji (legacy / getgrav feed) or a Lucide
	// icon name ("ShieldCheck", "shield-check") contributed by a plugin.
	// NamedLucideIcon loads the latter lazily; anything else falls back to
	// plain text.

	const ROTATE_MS = 8000;

	let activeIdx = $state(0);
	let dismissed = $state<Set<number | string>>(new Set());
	let interval: ReturnType<typeof setInterval> | null = null;

	const visible = $derived(notifications.filter((n) => !dismissed.has(n.id)));

	function next() {
		if (visible.length > 1) activeIdx = (activeIdx + 1) % visible.length;
	}
	function prev() {
		if (visible.length > 1) activeIdx = (activeIdx - 1 + visible.length) % visible.length;
	}

	function startRotation() {
		stopRotation();
		if (visible.length > 1) {
			interval = setInterval(next, ROTATE_MS);
		}
	}
	function stopRotation() {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
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

	// The address the admin is using: the browser's origin plus the site's
	// base path (serverUrl is path-only in the plugin build, absolute in dev).
	function siteUrl(): string {
		if (typeof window === 'undefined') return '';
		const url = new URL(auth.serverUrl || '/', window.location.origin);
		return (url.origin + url.pathname).replace(/\/+$/, '');
	}

	function fill(text: string): string {
		return text.replaceAll('{site_url}', siteUrl());
	}

	// A config button needs config write access; a route button is always shown.
	function buttonsOf(notif: Notification): NotificationButton[] {
		return (notif.actions ?? []).filter(
			(b) => b.label && (b.route || (b.config && canWrite('config')))
		);
	}

	let busy = $state<string | null>(null);

	async function runButton(notif: Notification, button: NotificationButton) {
		if (button.route) {
			await goto(`${base}${button.route.startsWith('/') ? '' : '/'}${button.route}`);
			return;
		}
		if (!button.config) return;
		busy = `${notif.id}:${button.label}`;
		try {
			const values = Object.fromEntries(
				Object.entries(button.config.values).map(([k, v]) => [
					k,
					typeof v === 'string' ? fill(v) : v
				])
			);
			await saveConfig(button.config.scope, values);
			// The condition behind the notice is gone, so the server stops
			// sending it; hide it now without recording a dismissal.
			dismissed = new Set([...dismissed, notif.id]);
			toast.success(fill(button.success || button.label));
		} catch (e) {
			toast.error(
				e instanceof Error && e.message ? e.message : i18n.t('ADMIN_NEXT.TOP_BANNER.ACTION_FAILED')
			);
		} finally {
			busy = null;
		}
	}

	onMount(() => stopRotation);
</script>

{#if visible.length > 0}
	{@const current = visible[activeIdx]}
	<div
		class="relative mb-5 overflow-hidden rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-fuchsia-500/5 to-transparent p-1"
		role="region"
		aria-label={i18n.t('ADMIN_NEXT.TOP_BANNER.SITE_NOTIFICATION')}
		onmouseenter={stopRotation}
		onmouseleave={startRotation}
	>
		<div
			class="relative flex items-start gap-3 px-4 py-3 {visible.length > 1
				? 'pe-28'
				: 'pe-12'} md:items-center"
		>
			{#if current.icon}
				<NamedLucideIcon
					name={current.icon}
					size={18}
					class="mt-0.5 shrink-0 text-purple-500 md:mt-0"
				>
					{#snippet fallback()}
						<span class="shrink-0 text-lg leading-none">{current.icon}</span>
					{/snippet}
				</NamedLucideIcon>
			{/if}
			<div class="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-3">
				<div
					class="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80"
				>
					{#if current.title}
						<span class="font-semibold">{current.title}</span>
						<span class="mx-1 text-muted-foreground">—</span>
					{/if}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<span>{@html renderInlineMarkdown(current.message)}</span>
				</div>
				{#if current.action || buttonsOf(current).length}
					<div class="flex shrink-0 flex-wrap items-center gap-2">
						{#if current.action}
							<a
								href={current.action.url}
								target="_blank"
								rel="noopener noreferrer"
								class="shrink-0 rounded-md border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-[0.75rem] font-semibold text-foreground transition-colors hover:bg-purple-500/20"
							>
								{current.action.label}
							</a>
						{/if}
						{#each buttonsOf(current) as button (button.label)}
							<button
								type="button"
								class="shrink-0 rounded-md px-3 py-1 text-[0.75rem] font-semibold transition-colors disabled:opacity-60 {button.primary
									? 'bg-primary text-primary-foreground hover:bg-primary/90'
									: 'border border-purple-500/40 bg-purple-500/10 text-foreground hover:bg-purple-500/20'}"
								disabled={busy !== null}
								onclick={() => runButton(current, button)}
							>
								{fill(button.label)}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="absolute end-2 top-2.5 flex items-center gap-1 md:top-1/2 md:-translate-y-1/2">
				{#if visible.length > 1}
					<div class="me-1 flex items-center gap-0.5">
						<button
							type="button"
							class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={prev}
							title={i18n.t('ADMIN_NEXT.TOP_BANNER.PREVIOUS')}
						>
							<DirectionalIcon name="chevron-back" size={14} />
						</button>
						<span class="px-1 text-[0.625rem] text-muted-foreground tabular-nums"
							>{activeIdx + 1}/{visible.length}</span
						>
						<button
							type="button"
							class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onclick={next}
							title="Next"
						>
							<DirectionalIcon name="chevron-forward" size={14} />
						</button>
					</div>
				{/if}
				<button
					type="button"
					class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => close(current)}
					title={i18n.t('ADMIN_NEXT.DISMISS')}
				>
					<X size={14} />
				</button>
			</div>
		</div>

		{#if visible.length > 1}
			<div class="absolute bottom-0 left-0 h-0.5 w-full bg-purple-500/10">
				<div
					class="h-full bg-purple-500/40"
					style="width: {((activeIdx + 1) / visible.length) * 100}%; transition: width 0.3s"
				></div>
			</div>
		{/if}
	</div>
{/if}
