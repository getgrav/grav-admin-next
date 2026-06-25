<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		addTwigAllowlist,
		clearTwigContentEvents,
		type ReportItem,
		type TwigContentMeta,
		type TwigContentItem,
		type TwigContentLeakItem,
		type TwigContentEventItem,
		type TwigAllowlistTarget,
	} from '$lib/api/endpoints/tools';
	import {
		CheckCircle2,
		AlertTriangle,
		ShieldCheck,
		ShieldOff,
		FileWarning,
		Ban,
		Settings2,
		Plus,
		Trash2,
		Loader2,
	} from 'lucide-svelte';

	let { report, onChanged }: { report: ReportItem; onChanged: () => void | Promise<void> } = $props();

	const meta = $derived((report.meta ?? {}) as Partial<TwigContentMeta>);
	const items = $derived(report.items as unknown as TwigContentItem[]);
	const leaks = $derived(items.filter((i): i is TwigContentLeakItem => i.kind === 'leak'));
	const events = $derived(items.filter((i): i is TwigContentEventItem => i.kind === 'event'));

	// Tokens currently being added (keyed) so each button can show its own spinner.
	let pending = $state<Record<string, boolean>>({});
	let clearing = $state(false);

	const statusConfig = {
		success: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
		warning: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle },
		error: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle },
	} as const;

	const banner = $derived(statusConfig[report.status] ?? statusConfig.success);

	function eventLabel(type: string): string {
		switch (type) {
			case 'gate_blocked':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_GATE_BLOCKED');
			case 'xss_blanked':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_XSS_BLANKED');
			case 'sandbox_tag':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_SANDBOX_TAG');
			case 'sandbox_filter':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_SANDBOX_FILTER');
			case 'sandbox_function':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_SANDBOX_FUNCTION');
			case 'sandbox_method':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_SANDBOX_METHOD');
			case 'sandbox_property':
				return i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.EVENT_SANDBOX_PROPERTY');
			default:
				return type;
		}
	}

	function leakKey(leak: TwigContentLeakItem): string {
		return `${leak.route}|${leak.reason}`;
	}

	async function addToAllowlist(target: TwigAllowlistTarget) {
		const key = `${target.rule}:${target.class}:${target.token}`;
		pending = { ...pending, [key]: true };
		try {
			const res = await addTwigAllowlist({ rule: target.rule, token: target.token, class: target.class });
			toast.success(
				i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.ADDED_TO_ALLOWLIST', {
					token: target.token,
					key: res.key,
				}),
			);
			await onChanged();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.ADD_FAILED'));
		} finally {
			const next = { ...pending };
			delete next[key];
			pending = next;
		}
	}

	async function clearEvents() {
		clearing = true;
		try {
			await clearTwigContentEvents();
			toast.success(i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.CLEARED_EVENTS'));
			await onChanged();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.CLEAR_FAILED'));
		} finally {
			clearing = false;
		}
	}

	function openSecurity() {
		goto(`${base}/config/security`);
	}
</script>

<div class="rounded-lg border border-border bg-card overflow-hidden">
	<div class="flex items-center justify-between gap-3 px-4 py-3">
		<h2 class="text-base font-semibold text-foreground">{report.title}</h2>
		<Button variant="outline" size="sm" onclick={openSecurity}>
			<Settings2 size={14} class="me-1.5" />
			{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.OPEN_SECURITY_SETTINGS')}
		</Button>
	</div>

	<!-- Status banner -->
	<div class="flex items-center gap-2 px-4 py-2.5 {banner.bg} {banner.text}">
		<svelte:component this={banner.icon} size={16} />
		<span class="text-sm font-medium">{report.message}</span>
	</div>

	<!-- Configuration state pills -->
	<div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
		<span
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {meta.gate
				? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
				: 'bg-muted text-muted-foreground'}"
		>
			<svelte:component this={meta.gate ? ShieldCheck : ShieldOff} size={13} />
			{meta.gate
				? i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.GATE_ON')
				: i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.GATE_OFF')}
		</span>
		<span
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {meta.sandbox
				? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
				: 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}"
		>
			<svelte:component this={meta.sandbox ? ShieldCheck : ShieldOff} size={13} />
			{meta.sandbox
				? i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SANDBOX_ON')
				: i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SANDBOX_OFF')}
		</span>
		<span
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {meta.xss_scan
				? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
				: 'bg-muted text-muted-foreground'}"
		>
			<svelte:component this={meta.xss_scan ? ShieldCheck : ShieldOff} size={13} />
			{meta.xss_scan
				? i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.XSS_SCAN_ON')
				: i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.XSS_SCAN_OFF')}
		</span>
	</div>

	<!-- Leaking pages -->
	{#if leaks.length > 0}
		<div class="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SECTION_LEAKS')}
		</div>
		<div class="divide-y divide-border">
			{#each leaks as leak (leakKey(leak))}
				<div class="flex items-start gap-2 px-4 py-2.5 text-sm">
					<FileWarning size={14} class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
					<div class="min-w-0">
						<div class="font-medium text-primary truncate">{leak.route}</div>
						<div class="text-xs text-muted-foreground">
							{leak.reason === 'gate_off'
								? i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.LEAK_GATE_OFF')
								: i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.LEAK_PAGE_OFF')}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Recent blocks -->
	{#if events.length > 0}
		<div class="flex items-center justify-between px-4 pt-3 pb-1">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SECTION_EVENTS')}
			</span>
			<Button variant="ghost" size="sm" onclick={clearEvents} disabled={clearing}>
				{#if clearing}
					<Loader2 size={13} class="me-1.5 animate-spin" />
				{:else}
					<Trash2 size={13} class="me-1.5" />
				{/if}
				{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.CLEAR_EVENTS')}
			</Button>
		</div>
		<div class="divide-y divide-border">
			{#each events as event, idx (idx)}
				{@const key = event.allowlist
					? `${event.allowlist.rule}:${event.allowlist.class}:${event.allowlist.token}`
					: ''}
				<div class="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
					<div class="flex items-start gap-2 min-w-0">
						<Ban size={14} class="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-foreground">{eventLabel(event.type)}</span>
								{#if event.token}
									<code class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">{event.token}</code>
								{/if}
								<span class="text-xs text-muted-foreground truncate">{event.route}</span>
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground">{event.hint}</div>
						</div>
					</div>
					{#if event.allowlist}
						<Button
							variant="outline"
							size="sm"
							class="shrink-0"
							onclick={() => addToAllowlist(event.allowlist!)}
							disabled={pending[key]}
						>
							{#if pending[key]}
								<Loader2 size={13} class="me-1.5 animate-spin" />
							{:else}
								<Plus size={13} class="me-1.5" />
							{/if}
							{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.ADD_TO_ALLOWLIST')}
						</Button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
