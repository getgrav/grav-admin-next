<script lang="ts">
	import { Pencil, X, Check, Layout, Globe, RotateCcw, Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { PRESETS, type PresetDef } from '$lib/dashboard/presets';

	let {
		editMode = $bindable(false),
		dirty = false,
		saving = false,
		canEditSite = false,
		onSaveUser,
		onSaveSite,
		onApplyPreset,
		onCancel,
		onResetToDefault,
	}: {
		editMode?: boolean;
		dirty?: boolean;
		saving?: boolean;
		canEditSite?: boolean;
		onSaveUser: () => void | Promise<void>;
		onSaveSite?: () => void | Promise<void>;
		onApplyPreset: (preset: PresetDef) => void;
		onCancel: () => void;
		onResetToDefault: () => void;
	} = $props();

	let presetOpen = $state(false);
	let presetButton: HTMLButtonElement | undefined = $state();

	function selectPreset(p: PresetDef) {
		presetOpen = false;
		onApplyPreset(p);
	}

	function selectReset() {
		presetOpen = false;
		onResetToDefault();
	}

	function handleClickOutside(e: MouseEvent) {
		if (!presetOpen) return;
		const target = e.target as Node;
		if (presetButton && !presetButton.contains(target) && !document.getElementById('preset-menu')?.contains(target)) {
			presetOpen = false;
		}
	}

	$effect(() => {
		if (presetOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});
</script>

{#if editMode}
	<div class="flex items-center gap-2">
		<div class="relative">
			<Button bind:ref={presetButton} variant="outline" size="sm" onclick={() => presetOpen = !presetOpen}>
				<Layout size={13} />
				Presets
			</Button>
			{#if presetOpen}
				<div id="preset-menu" class="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-popover p-1 shadow-lg">
					<div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Layout presets</div>
					{#each PRESETS as preset}
						<button type="button" class="block w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-accent" onclick={() => selectPreset(preset)}>
							<div class="text-[13px] font-medium text-foreground">{preset.label}</div>
							<div class="text-[11px] text-muted-foreground">{preset.description}</div>
						</button>
					{/each}
					<div class="my-1 h-px bg-border"></div>
					<button type="button" class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-accent" onclick={selectReset}>
						<RotateCcw size={12} />
						Reset my layout
					</button>
				</div>
			{/if}
		</div>

		{#if canEditSite && onSaveSite}
			<Button variant="outline" size="sm" onclick={() => onSaveSite()} disabled={saving} title="Save as site default for all users">
				<Globe size={13} />
				Save as site default
			</Button>
		{/if}

		<Button variant="outline" size="sm" onclick={onCancel} disabled={saving}>
			<X size={13} />
			Cancel
		</Button>

		<Button variant="default" size="sm" onclick={() => onSaveUser()} disabled={saving || !dirty}>
			{#if saving}<Loader2 size={13} class="animate-spin" />{:else}<Check size={13} />{/if}
			Save
		</Button>
	</div>
{:else}
	<Button variant="outline" size="sm" onclick={() => editMode = true} title="Customize dashboard">
		<Pencil size={13} />
		Customize
	</Button>
{/if}
