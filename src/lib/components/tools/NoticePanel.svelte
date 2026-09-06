<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ChevronDown, AlertTriangle, Info, ShieldAlert } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * A collapsed-by-default list of standing notices, with a count on the header.
	 *
	 * These are advisories about how a tool is set up, not events -- they say the
	 * same thing on every visit, and once the reader has acted on them or decided
	 * not to, the only thing left is the space they take up above the controls
	 * somebody actually came for. So the header carries the count and the highest
	 * severity present, and the notices themselves stay out of the way until asked
	 * for. Nothing is dismissed: a notice that stops being true stops rendering,
	 * and a notice that is still true is one click away rather than gone.
	 *
	 * `storageKey` remembers open or closed for this reader, per panel.
	 */
	type Severity = 'error' | 'warning' | 'info';

	interface Props {
		count: number;
		severity: Severity;
		storageKey: string;
		children?: Snippet;
	}
	let { count, severity, storageKey, children }: Props = $props();

	function initialOpen(): boolean {
		try {
			return localStorage.getItem(storageKey) === 'open';
		} catch {
			// Private windows and blocked site data throw on access rather than
			// returning null, and a notice list is not worth a broken page.
			return false;
		}
	}

	let open = $state(initialOpen());

	function toggle() {
		open = !open;
		try {
			localStorage.setItem(storageKey, open ? 'open' : 'closed');
		} catch {
			/* nothing to do -- the panel still works, it just won't be remembered */
		}
	}

	const label = $derived(i18n.t('ADMIN_NEXT.NOTICES.HEADING', { count }));

	const tone = $derived(
		{
			error: 'text-red-700 dark:text-red-300',
			warning: 'text-amber-700 dark:text-amber-400',
			info: 'text-muted-foreground',
		}[severity]
	);

	const badgeTone = $derived(
		{
			error: 'bg-red-600/10 text-red-700 dark:bg-red-500/15 dark:text-red-300',
			warning: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
			info: 'bg-secondary text-secondary-foreground',
		}[severity]
	);
</script>

{#if count > 0}
	<div class="rounded-lg border border-border bg-muted/40">
		<button
			type="button"
			onclick={toggle}
			aria-expanded={open}
			aria-label={open ? i18n.t('ADMIN_NEXT.NOTICES.HIDE') : i18n.t('ADMIN_NEXT.NOTICES.SHOW')}
			class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		>
			{#if severity === 'error'}
				<ShieldAlert size={16} class="shrink-0 {tone}" />
			{:else if severity === 'warning'}
				<AlertTriangle size={16} class="shrink-0 {tone}" />
			{:else}
				<Info size={16} class="shrink-0 {tone}" />
			{/if}

			<span class="font-medium text-foreground">{label}</span>

			<span class="inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-medium {badgeTone}">
				{count}
			</span>

			<ChevronDown
				size={16}
				class="ms-auto shrink-0 text-muted-foreground transition-transform duration-150 {open ? 'rotate-180' : ''}"
			/>
		</button>

		{#if open}
			<div class="space-y-3 border-t border-border px-3 py-3">
				{@render children?.()}
			</div>
		{/if}
	</div>
{/if}
