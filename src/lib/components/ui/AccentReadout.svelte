<script lang="ts">
	/**
	 * The colour the hue and saturation sliders currently make, written out so
	 * it can be read, copied and pasted somewhere else. The admin only stores
	 * hue and saturation; lightness is fixed per colour mode (see
	 * theme.svelte.ts), so the readout shows the value for the mode on screen
	 * and names the mode, and the copy button copies exactly that string.
	 */
	import { theme } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Copy, Check } from 'lucide-svelte';

	interface Props {
		hue: number;
		saturation: number;
	}
	let { hue, saturation }: Props = $props();

	const lightness = $derived(theme.isDark ? 65 : 40);
	const hsl = $derived(`hsl(${hue} ${saturation}% ${lightness}%)`);
	const hex = $derived(hslToHex(hue, saturation, lightness));
	const modeLabel = $derived(theme.isDark ? i18n.t('ADMIN_NEXT.SETTINGS.DARK') : i18n.t('ADMIN_NEXT.SETTINGS.LIGHT'));

	let copied = $state(false);

	function hslToHex(h: number, s: number, l: number): string {
		const sat = s / 100;
		const lig = l / 100;
		const k = (n: number) => (n + h / 30) % 12;
		const a = sat * Math.min(lig, 1 - lig);
		const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
		const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
		return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
	}

	async function copy(): Promise<void> {
		try {
			await navigator.clipboard.writeText(`${hsl} ${hex}`);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		} catch {
			// Clipboard access can be refused; the text is still on screen to select.
		}
	}
</script>

<div class="flex items-center gap-3 pt-1">
	<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">{i18n.t('ADMIN_NEXT.SETTINGS.CURRENT_COLOR')}</span>
	<span class="h-5 w-5 shrink-0 rounded-md border border-border" style="background: {hsl}" aria-hidden="true"></span>
	<code class="min-w-0 flex-1 truncate font-mono text-xs text-foreground select-all">{hsl} <span class="text-muted-foreground">{hex}</span></code>
	<span class="shrink-0 text-xs text-muted-foreground">{modeLabel}</span>
	<button
		type="button"
		class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
		onclick={copy}
		title={i18n.t('ADMIN_NEXT.SETTINGS.COPY_COLOR')}
		aria-label={i18n.t('ADMIN_NEXT.SETTINGS.COPY_COLOR')}
	>
		{#if copied}
			<Check size={14} class="text-green-500" />
		{:else}
			<Copy size={14} />
		{/if}
	</button>
</div>
