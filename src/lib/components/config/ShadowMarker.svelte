<script lang="ts">
	/**
	 * The "a layer above wins" marker: a small icon that opens a popover saying
	 * which layer sets this value, what the site actually uses, and what can be
	 * done about it.
	 *
	 * Deliberately unlike the amber revert arrow (FieldOverrideIndicator), which
	 * means "this layer overrides the one beneath; click to revert". This one
	 * means "something above this layer wins, so saving here won't apply".
	 *
	 * The popover is a native `popover="auto"` (top layer, light dismiss, Escape)
	 * moved to <body>, so it is never clipped and its clicks never reach a
	 * `<label>` or clickable row the marker sits in. The icon's own click stops
	 * propagating for the same reason.
	 */
	import { on } from 'svelte/events';
	import { Layers, ServerCog } from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { portal } from '$lib/utils/portal';
	import { switchEnvironment } from '$lib/utils/switch-environment';
	import { shadowValueText } from '$lib/utils/config-shadowed.svelte';
	import type { EnabledSource } from '$lib/utils/config-shadowed';

	interface Props {
		/** Where the winning value comes from. */
		source: EnabledSource;
		/** `field`: a config field. `enabled`: a plugin's on/off toggle. */
		variant?: 'field' | 'enabled';
		/** Show the value the site uses (only when it is this field's own value). */
		hasValue?: boolean;
		value?: unknown;
		/** Offer "Remove override" (environment source only). */
		canRemove?: boolean;
		busy?: boolean;
		onremove?: () => void;
		size?: number;
	}

	let {
		source, variant = 'field', hasValue = false, value, canRemove = false, busy = false, onremove, size = 12,
	}: Props = $props();

	const uid = $props.id();
	const popId = `config-shadow-${uid}`;

	let button = $state<HTMLButtonElement>();
	let popup = $state<HTMLElement>();
	let open = $state(false);

	const isEnv = $derived(source.source === 'environment' && !!source.environment);
	const env = $derived(source.environment ?? '');

	const title = $derived(
		variant === 'enabled'
			? isEnv
				? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.ENABLED_ENV', { env })
				: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.ENABLED_SERVER')
			: isEnv
				? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.MARKER_ENV', { env })
				: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.MARKER_SERVER')
	);
	const explain = $derived(
		variant === 'enabled'
			? isEnv
				? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.ENABLED_EXPLAIN_ENV', { env })
				: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.ENABLED_EXPLAIN_SERVER')
			: isEnv
				? i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.EXPLAIN_ENV', { env })
				: i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.EXPLAIN_SERVER')
	);

	function place() {
		if (!button || !popup) return;
		const anchor = button.getBoundingClientRect();
		const viewW = document.documentElement.clientWidth;
		const viewH = document.documentElement.clientHeight;
		const pad = 8;
		const gap = 6;
		const w = popup.offsetWidth;
		const h = popup.offsetHeight;
		const left = Math.max(pad, Math.min(anchor.left + anchor.width / 2 - w / 2, viewW - w - pad));
		let top = anchor.bottom + gap;
		if (top + h > viewH - pad && anchor.top - gap - h >= pad) top = anchor.top - gap - h;
		popup.style.left = `${left}px`;
		popup.style.top = `${Math.max(pad, top)}px`;
	}

	function close() {
		try {
			popup?.hidePopover();
		} catch {
			/* already closed */
		}
	}

	$effect(() => {
		if (!popup) return;
		return on(popup, 'toggle', (e) => {
			open = (e as ToggleEvent).newState === 'open';
			if (open) place();
		});
	});

	$effect(() => {
		if (!open) return;
		const offs = [
			on(window, 'resize', place),
			on(window, 'scroll', place, { capture: true, passive: true }),
		];
		return () => offs.forEach((off) => off());
	});

	// A popover left open when its field goes away would stay in the top layer.
	$effect(() => () => close());
</script>

<button
	bind:this={button}
	type="button"
	popovertarget={popId}
	class="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-primary/75 transition-colors hover:bg-muted hover:text-primary"
	title={title}
	aria-label={title}
	aria-expanded={open}
	onclick={(e) => e.stopPropagation()}
	ondblclick={(e) => e.stopPropagation()}
>
	{#if isEnv}
		<Layers {size} strokeWidth={2.25} />
	{:else}
		<ServerCog {size} strokeWidth={2.25} />
	{/if}
</button>

<div
	bind:this={popup}
	use:portal
	id={popId}
	popover="auto"
	role="dialog"
	aria-label={title}
	class="fixed inset-auto m-0 w-72 max-w-[calc(100vw-16px)] rounded-md border border-border bg-popover p-3 text-start text-xs font-normal text-popover-foreground shadow-md"
>
	<p class="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground">
		{#if isEnv}
			<Layers size={13} class="shrink-0 text-primary" />
		{:else}
			<ServerCog size={13} class="shrink-0 text-primary" />
		{/if}
		<span class="min-w-0">{title}</span>
	</p>
	<p class="mt-1 leading-relaxed text-muted-foreground">{explain}</p>
	{#if hasValue}
		<div class="mt-2 flex items-baseline gap-2">
			<span class="shrink-0 text-muted-foreground">{i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SITE_USES')}</span>
			<code class="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground">{shadowValueText(value)}</code>
		</div>
	{/if}
	{#if isEnv && source.file}
		<p class="mt-2 break-all font-mono text-[0.625rem] text-muted-foreground/80">{source.file}</p>
	{/if}
	{#if isEnv}
		<div class="mt-3 flex flex-wrap justify-end gap-2">
			{#if canRemove && onremove}
				<button
					type="button"
					class="h-7 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					disabled={busy}
					onclick={() => {
						close();
						onremove();
					}}
				>
					{i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.REMOVE_OVERRIDE')}
				</button>
			{/if}
			<button
				type="button"
				class="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				onclick={() => {
					close();
					switchEnvironment(env);
				}}
			>
				{i18n.t('ADMIN_NEXT.CONFIG.SHADOWED.SWITCH_TO', { env })}
			</button>
		</div>
	{/if}
</div>
