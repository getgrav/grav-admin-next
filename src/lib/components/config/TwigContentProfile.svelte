<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ChevronsUpDown, ShieldHalf } from 'lucide-svelte';

	let { data, onchange }: { data: Record<string, unknown>; onchange: (path: string, value: unknown) => void } = $props();

	const tc = $derived((data?.twig_content ?? {}) as Record<string, unknown>);
	const processEnabled = $derived(!!tc.process_enabled);
	const editorEnabled = $derived(!!tc.editor_enabled);

	// Mirror of Grav\Common\Security::twigContentProfileFromFlags — the canonical
	// mapping lives in core; this keeps the selector responsive without a round-trip.
	function profileFromFlags(process: boolean, editor: boolean): string {
		if (!process) return editor ? 'custom' : 'off';
		return editor ? 'all' : 'trusted';
	}

	const current = $derived(profileFromFlags(processEnabled, editorEnabled));

	const flagsForProfile: Record<string, [boolean, boolean]> = {
		off: [false, false],
		trusted: [true, false],
		all: [true, true],
	};

	const options = $derived([
		{ value: 'off', label: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.OFF') },
		{ value: 'trusted', label: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.TRUSTED') },
		{ value: 'all', label: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.ALL') },
		...(current === 'custom' ? [{ value: 'custom', label: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.CUSTOM') }] : []),
	]);

	const description = $derived(
		{
			off: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.OFF_DESC'),
			trusted: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.TRUSTED_DESC'),
			all: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.ALL_DESC'),
			custom: i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.CUSTOM_DESC'),
		}[current] ?? '',
	);

	function select(value: string) {
		const flags = flagsForProfile[value];
		if (!flags) return; // 'custom' is display-only; ignore re-selecting it
		// Writes the two canonical keys; the Advanced toggles below stay in sync.
		onchange('twig_content.process_enabled', flags[0]);
		onchange('twig_content.editor_enabled', flags[1]);
	}
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<div class="mb-2 flex items-center gap-2">
		<ShieldHalf size={16} class="text-muted-foreground" />
		<h3 class="text-sm font-semibold text-foreground">{i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.LABEL')}</h3>
	</div>
	<p class="mb-3 text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.CONFIG.TWIG_PROFILE.HELP')}</p>

	<div class="relative max-w-xs">
		<select
			class="flex h-10 w-full appearance-none rounded-lg border border-input bg-muted/50 ps-3 pe-8 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			value={current}
			onchange={(e) => select((e.target as HTMLSelectElement).value)}
		>
			{#each options as opt (opt.value)}
				<option value={opt.value} selected={current === opt.value}>{opt.label}</option>
			{/each}
		</select>
		<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pe-2.5">
			<ChevronsUpDown size={14} class="text-muted-foreground" />
		</div>
	</div>

	{#if description}
		<p class="mt-2 text-xs text-muted-foreground">{description}</p>
	{/if}
</div>
