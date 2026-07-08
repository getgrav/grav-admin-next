<script lang="ts">
	import { onMount } from 'svelte';
	import { Lock } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { refreshMe } from '$lib/api/auth';

	// Absolute epoch (ms) the next reset is due, derived from the local sync
	// anchor rather than a decrementing counter — immune to setInterval drift and
	// self-correcting on every fresh /me (which re-stamps demoStateFetchedAt).
	const resetAt = $derived(
		auth.demoSecondsUntilReset != null
			? auth.demoStateFetchedAt + auth.demoSecondsUntilReset * 1000
			: null
	);

	let now = $state(Date.now());
	onMount(() => {
		const tick = setInterval(() => { now = Date.now(); }, 1000);
		// Re-sync the countdown against the server periodically so it corrects for
		// a reset that fired earlier/later than predicted. Only while in demo mode.
		const resync = setInterval(() => { if (auth.demoMode) refreshMe(); }, 60_000);
		return () => { clearInterval(tick); clearInterval(resync); };
	});

	const remainingMs = $derived(resetAt != null ? Math.max(0, resetAt - now) : null);

	const countdown = $derived.by(() => {
		if (remainingMs == null) return null;
		const total = Math.floor(remainingMs / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	});

	// Three honest modes, derived from the payload:
	//  - read-only    : nothing writable — no reset, no countdown
	//  - reset-active : writable AND a baseline exists (seconds_until_reset set)
	//  - editable     : writable but no baseline captured yet — no reset promise
	const readOnly = $derived(auth.demoWritable.length === 0);
	const resetActive = $derived(auth.demoSecondsUntilReset != null);

	const label = $derived(
		readOnly
			? i18n.t('ADMIN_NEXT.DEMO.BANNER_READONLY')
			: resetActive
				? i18n.t('ADMIN_NEXT.DEMO.BANNER_MESSAGE', { minutes: auth.demoResetInterval })
				: i18n.t('ADMIN_NEXT.DEMO.BANNER_LABEL')
	);
</script>

{#if auth.demoMode}
	<div
		class="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[0.75rem] font-medium text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
		role="status"
	>
		<span class="inline-flex items-center gap-1.5">
			<Lock size={13} />
			{label}
		</span>
		{#if resetActive && countdown != null}
			<span class="tabular-nums opacity-80">
				{i18n.t('ADMIN_NEXT.DEMO.BANNER_COUNTDOWN', { time: countdown })}
			</span>
		{/if}
	</div>
{/if}
