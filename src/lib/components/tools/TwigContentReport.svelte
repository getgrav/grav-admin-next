<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		addTwigAllowlist,
		clearTwigContentEvents,
		scanTwigContent,
		type ReportItem,
		type TwigContentMeta,
		type TwigContentItem,
		type TwigContentLeakItem,
		type TwigContentEventItem,
		type TwigAllowlistTarget,
		type TwigContentScan,
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
		ScanSearch,
	} from 'lucide-svelte';

	let { report, onChanged }: { report: ReportItem; onChanged: () => void | Promise<void> } = $props();

	const meta = $derived((report.meta ?? {}) as Partial<TwigContentMeta>);
	const items = $derived(report.items as unknown as TwigContentItem[]);
	const leaks = $derived(items.filter((i): i is TwigContentLeakItem => i.kind === 'leak'));

	// Allowlist targets the operator has resolved this session (keyed) — used to
	// hide their now-fixed rows optimistically.
	let resolved = $state<Set<string>>(new Set());
	// Hide rows the operator just allowed straight away — the backend also purges
	// the resolved events, but this drops the row before the refetch lands so the
	// click has immediate, visible effect.
	const events = $derived(
		items
			.filter((i): i is TwigContentEventItem => i.kind === 'event')
			.filter((e) => !(e.allowlist && resolved.has(allowlistKey(e.allowlist)))),
	);

	// Tokens currently being added (keyed) so each button can show its own spinner.
	let pending = $state<Record<string, boolean>>({});
	let clearing = $state(false);
	let scanning = $state(false);
	let scan = $state<TwigContentScan | null>(null);

	const scanGroups = $derived(
		scan
			? ([
					['tags', scan.tags],
					['filters', scan.filters],
					['functions', scan.functions],
				] as const).filter(([, m]) => Object.keys(m).length > 0)
			: [],
	);
	const scanEmpty = $derived(!!scan && scanGroups.length === 0);

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

	function allowlistKey(target: TwigAllowlistTarget): string {
		return `${target.rule}:${target.class}:${target.token}`;
	}

	async function addToAllowlist(target: TwigAllowlistTarget) {
		const key = allowlistKey(target);
		pending = { ...pending, [key]: true };
		try {
			const res = await addTwigAllowlist({ rule: target.rule, token: target.token, class: target.class });
			// Hide the resolved row immediately, then refetch (the backend has now
			// purged the matching events too).
			resolved = new Set(resolved).add(key);
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

	// A route is linkable to the page editor when it's a real page route, not the
	// 'unknown' placeholder some events carry.
	function isLinkable(route: string): boolean {
		return !!route && route.startsWith('/') && route !== '/unknown';
	}

	function pageHref(route: string): string {
		return `${base}/pages/edit${route}`;
	}

	async function runScan() {
		scanning = true;
		try {
			scan = await scanTwigContent();
		} catch {
			toast.error(i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SCAN_FAILED'));
		} finally {
			scanning = false;
		}
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

	<!-- Migrated-from-1.7 misconfiguration callout -->
	{#if meta.global_request_gated || meta.frontmatter_request_gated}
		<div class="mx-4 mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
			<AlertTriangle size={14} class="mt-0.5 shrink-0" />
			<span>
				{meta.global_request_gated
					? i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.GLOBAL_REQUEST_GATED')
					: i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.FRONTMATTER_REQUEST_GATED')}
			</span>
		</div>
	{/if}

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
						{#if isLinkable(leak.route)}
							<a href={pageHref(leak.route)} class="font-medium text-primary truncate hover:underline">{leak.route}</a>
						{:else}
							<div class="font-medium text-primary truncate">{leak.route}</div>
						{/if}
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
				{@const key = event.allowlist ? allowlistKey(event.allowlist) : ''}
				<div class="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
					<div class="flex items-start gap-2 min-w-0">
						<Ban size={14} class="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium text-foreground">{eventLabel(event.type)}</span>
								{#if event.token}
									<code class="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">{event.token}</code>
								{/if}
								{#if isLinkable(event.route)}
									<a href={pageHref(event.route)} class="text-xs text-primary truncate hover:underline">{event.route}</a>
								{:else}
									<span class="text-xs text-muted-foreground truncate">{event.route}</span>
								{/if}
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

	<!-- Content scan: what content uses that the sandbox doesn't allow yet -->
	<div class="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
		<span class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SCAN_INTRO')}</span>
		<Button variant="outline" size="sm" class="shrink-0" onclick={runScan} disabled={scanning}>
			{#if scanning}
				<Loader2 size={13} class="me-1.5 animate-spin" />
			{:else}
				<ScanSearch size={13} class="me-1.5" />
			{/if}
			{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SCAN_CONTENT')}
		</Button>
	</div>

	{#if scanEmpty}
		<div class="flex items-center gap-2 px-4 pb-3 text-sm text-emerald-700 dark:text-emerald-400">
			<CheckCircle2 size={14} />
			{i18n.t('ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SCAN_CLEAN')}
		</div>
	{:else if scanGroups.length > 0}
		<div class="space-y-3 px-4 pb-4">
			{#each scanGroups as [type, tokenMap] (type)}
				<div>
					<div class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{i18n.t(`ADMIN_NEXT.TOOLS.REPORTS.TWIG_CONTENT.SCAN_${type.toUpperCase()}`)}
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each Object.entries(tokenMap) as [token, routes] (token)}
							<span
								class="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300"
								title={routes.join(', ')}
							>
								<code class="font-mono">{token}</code>
								<span class="text-amber-700/60 dark:text-amber-400/60">×{routes.length}</span>
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
