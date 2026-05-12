<script lang="ts">
	import {
		HueyRoot,
		SaturationArea,
		HueSlider,
		AlphaSlider,
		HexInput,
		ColorDropper,
		ColorSwatch,
		hueyColor,
	} from '@hueycolor/svelte';
	import type { HueyColor } from '@hueycolor/core';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { Pipette } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();

	// Alpha is opt-out via `alpha: false` in the blueprint. Default keeps the
	// slider visible and lets 8-digit #RRGGBBAA flow through; flipping to
	// false hides the slider and emits a strict 6-digit #RRGGBB (matches the
	// Grav classic colorpicker convention so themes that parse the value
	// don't break).
	const alphaEnabled = $derived(field.alpha !== false);

	// Initial color — prefer the explicit blueprint default, then placeholder,
	// then a sensible fallback. The default is visual-only: the swatch shows
	// it but we don't emit it as a value (mirrors the placeholder-suppression
	// behaviour below so the form doesn't go dirty on mount).
	const initialHex = $derived.by(() => {
		const v = typeof value === 'string' ? value.trim() : '';
		if (v) return v;
		const d = typeof field.default === 'string' ? field.default.trim() : '';
		if (d) return d;
		const ph = (field.placeholder || '').trim();
		if (ph) return ph;
		return '#000000';
	});

	function safeHueyColor(input: string): HueyColor {
		try { return hueyColor(input); }
		catch { return hueyColor('#000000'); }
	}

	function normalize(s: string): string {
		return (s || '').trim().toLowerCase();
	}

	function emitHex(c: HueyColor): string {
		// `toHex()` always returns RRGGBB (6 chars). `toHexString()` returns
		// `#RRGGBB` when alpha is 1, `#RRGGBBAA` otherwise.
		return alphaEnabled ? c.toHexString().toUpperCase() : ('#' + c.toHex().toUpperCase());
	}

	// Bind a HueyColor object — HueyRoot rewrites it on every change. We mirror
	// it back out to the form via onchange as a hex string (the format admin
	// blueprints expect for colorpicker fields).
	let color = $state<HueyColor>(safeHueyColor(initialHex));

	// `syncing` suppresses the color → onchange emission whenever WE set
	// `color` from an incoming `value` prop change (initial mount, remote
	// collab edit, undo). Without it, the very first effect tick fires
	// onchange("#FFFFFF") because the placeholder-derived color doesn't
	// match the empty form value — that cascades into the parent during
	// init and trips Svelte's lifecycle_outside_component guard.
	let syncing = false;
	// Seed lastValue from `color`'s actual hex (not the form value), so that
	// when value is empty but we displayed the placeholder, the first run of
	// the color → onchange effect doesn't emit "I am the placeholder" as if
	// the user had picked it. That spurious initial emit is what marks the
	// page dirty on load.
	let lastValue = normalize(emitHex(color));

	$effect(() => {
		const incoming = normalize(typeof value === 'string' ? value : '');
		if (incoming === lastValue) return;
		lastValue = incoming;
		syncing = true;
		color = safeHueyColor(incoming || initialHex);
	});

	$effect(() => {
		const next = emitHex(color);
		const nextNorm = normalize(next);
		if (syncing) { syncing = false; return; }
		if (nextNorm === lastValue) return;
		lastValue = nextNorm;
		onchange(next);
	});

	let open = $state(false);
	let containerEl = $state<HTMLDivElement | null>(null);

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
		}
	}

	onMount(() => document.addEventListener('mousedown', handleClickOutside));
	onDestroy(() => document.removeEventListener('mousedown', handleClickOutside));

	const presets = [
		'#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
		'#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
		'#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#000000',
	];

	const swatchHex = $derived(color.toHexString());
</script>

<div class="relative inline-block w-full max-w-[260px]" bind:this={containerEl}>
	<!-- Trigger: swatch + hex text -->
	<button
		type="button"
		onclick={() => { open = !open; }}
		class="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-muted/50 px-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
	>
		<span
			class="h-6 w-6 shrink-0 rounded border border-border"
			style="background:{swatchHex}"
			aria-hidden="true"
		></span>
		<span class="flex-1 text-left font-mono text-foreground">{swatchHex.toUpperCase()}</span>
	</button>

	{#if open}
		<div
			class="huey-popover absolute left-0 top-full z-50 mt-1 w-[260px] space-y-3 rounded-xl border border-border bg-popover p-3 shadow-lg"
		>
			<HueyRoot bind:color>
				<SaturationArea class="huey-saturation" aria-label="Saturation and lightness" />

				<div class="flex items-center gap-2">
					<ColorDropper class="huey-dropper" aria-label="Pick color from screen">
						{#snippet children()}<Pipette size={16} />{/snippet}
					</ColorDropper>
					<div class="flex-1 space-y-2">
						<HueSlider class="huey-slider" aria-label="Hue" />
						{#if alphaEnabled}
							<AlphaSlider class="huey-slider" aria-label="Opacity" />
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hex</span>
					<HexInput class="huey-hex" />
				</div>

				<ColorSwatch class="huey-swatches" swatch={presets} />
			</HueyRoot>
		</div>
	{/if}
</div>

<style>
	/* Style Huey's headless primitives with admin-next design tokens.
		 Components are styled via the global CSS targets they emit (data
		 attributes like [huey-slider-thumb], [huey-input], etc.) plus the
		 class names we pass through. :global is required because Huey
		 renders into an unknown DOM subtree. */
	:global(.huey-saturation) {
		position: relative;
		width: 100%;
		height: 140px;
		border-radius: 6px;
		overflow: hidden;
		cursor: crosshair;
	}

	/* Make the slider track stretch to its container — Huey defaults to 129px.
		 Background painting (rainbow for hue, dynamic checkerboard for alpha)
		 is handled by Huey's own [huey-slider='hue'] / [huey-slider='alpha']
		 rules, so don't override the background here. */
	:global(.huey-slider) {
		--huey-slider-track-height: 14px;
		--huey-slider-track-width: 100%;
		border-radius: 999px;
	}

	/* Visible on any slider color: white core + dark thin ring + drop shadow.
		 The ring is what carries through pale colors; the shadow lifts it off
		 white backgrounds (pale-yellow corner of saturation area, light-mode
		 popover background). */
	:global([huey-slider-thumb]) {
		--huey-thumb-size: 16px;
		background-color: white;
		box-shadow:
			inset 0 0 0 2px rgba(0, 0, 0, 0.55),
			0 1px 3px rgba(0, 0, 0, 0.45);
	}

	:global(.huey-saturation [huey-slider-thumb]) {
		--huey-thumb-size: 14px;
	}

	:global(.huey-dropper) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 6px;
		background: transparent;
		color: hsl(var(--muted-foreground));
		border: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: color 120ms, background 120ms;
	}
	:global(.huey-dropper:hover) {
		color: hsl(var(--foreground));
		background: hsl(var(--muted));
	}

	:global(.huey-hex) {
		flex: 1;
		display: block;
		width: 100%;
		height: 32px;
		padding: 0 8px;
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
		font-size: 13px;
		text-transform: uppercase;
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--input));
		border-radius: 6px;
		outline: none;
	}
	:global(.huey-hex:focus) {
		box-shadow: 0 0 0 1px hsl(var(--ring));
	}

	:global(.huey-swatches) {
		display: grid;
		grid-template-columns: repeat(9, minmax(0, 1fr));
		gap: 4px;
	}
	:global(.huey-swatches > *) {
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 4px;
		border: 1px solid hsl(var(--border));
		cursor: pointer;
		padding: 0;
	}
</style>
