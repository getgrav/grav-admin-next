<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { configEnv } from '$lib/stores/configEnvironment.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { ChevronDown, Plus, Check } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { onMount, tick } from 'svelte';

	let open = $state(false);
	let creating = $state(false);
	let showCreateInput = $state(false);
	let newName = $state('');
	let createInputEl: HTMLInputElement | undefined = $state();

	onMount(() => {
		configEnv.load().catch(() => { /* non-fatal */ });
		const unsub = invalidations.subscribe('system:environments', () => {
			configEnv.load().catch(() => {});
		});
		return () => unsub();
	});

	function select(name: string) {
		open = false;
		if (name === configEnv.target) return;
		configEnv.setTarget(name);
		toast.info(name === '' ? 'Saving to default (user/config)' : `Saving to env: ${name}`);
	}

	async function showCreate() {
		newName = configEnv.detected || '';
		showCreateInput = true;
		await tick();
		createInputEl?.select();
	}

	async function submitCreate() {
		const name = newName.trim();
		if (!name) return;
		creating = true;
		try {
			await configEnv.createAndSelect(name);
			toast.success(`Environment '${name}' created and selected`);
			showCreateInput = false;
			open = false;
		} catch (e) {
			const msg = e && typeof e === 'object' && 'message' in e
				? (e as { message: string }).message
				: 'Failed to create environment';
			toast.error(msg);
		} finally {
			creating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showCreateInput) {
				showCreateInput = false;
			} else {
				open = false;
			}
		}
	}

	const badgeLabel = $derived(configEnv.target === '' ? 'Default' : configEnv.target);
	const targetIsMissing = $derived(
		configEnv.target !== '' &&
		configEnv.environments.length > 0 &&
		!configEnv.environments.some((e) => e.name === configEnv.target),
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative" onkeydown={handleKeydown}>
	<button
		type="button"
		class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors
			{targetIsMissing
				? 'border-destructive/40 bg-destructive/10 text-destructive'
				: configEnv.target === ''
					? 'border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted'
					: 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'}"
		onclick={() => open = !open}
		title={i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SELECT_WHERE_CONFIG_WRITES_ARE_SAVED')}
	>
		<span>{badgeLabel}</span>
		<ChevronDown size={11} class="transition-transform {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-40" onclick={() => open = false}></div>
		<div class="absolute left-0 z-50 mt-1 min-w-[240px] rounded-md border border-border bg-popover py-1 shadow-md">
			<div class="px-3 pb-1 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
				{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SAVE_CONFIG_TO')}
			</div>

			{#each configEnv.environments as env}
				<button
					type="button"
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors
						{env.name === configEnv.target
							? 'bg-accent text-accent-foreground font-medium'
							: 'text-popover-foreground hover:bg-accent/50'}"
					onclick={() => select(env.name)}
				>
					<span class="flex h-4 w-4 items-center justify-center">
						{#if env.name === configEnv.target}
							<Check size={13} />
						{/if}
					</span>
					<span class="flex-1">{env.label}</span>
					{#if env.hasOverrides}
						<span class="text-[10px] text-muted-foreground">{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.HAS_OVERRIDES')}</span>
					{/if}
				</button>
			{/each}

			<div class="mt-1 border-t border-border pt-1">
				{#if !showCreateInput}
					<button
						type="button"
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-popover-foreground transition-colors hover:bg-accent/50"
						onclick={showCreate}
					>
						<Plus size={13} />
						<span>
							{configEnv.detected
								? `Create env "${configEnv.detected}"…`
								: 'Create environment…'}
						</span>
					</button>
				{:else}
					<form class="flex items-center gap-1 px-2 py-1.5" onsubmit={(e) => { e.preventDefault(); submitCreate(); }}>
						<input
							bind:this={createInputEl}
							bind:value={newName}
							type="text"
							placeholder="env-name"
							disabled={creating}
							class="h-7 flex-1 rounded border border-border bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
							pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
						/>
						<button
							type="submit"
							class="h-7 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
							disabled={creating || !newName.trim()}
						>{creating ? '…' : 'Create'}</button>
					</form>
					<p class="px-3 pb-1 text-[10px] text-muted-foreground">
						{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CREATES_PATH', { name: newName || '<name>' })}
					</p>
				{/if}
			</div>

			{#if targetIsMissing}
				<div class="mt-1 border-t border-border px-3 py-1.5 text-[11px] text-destructive">
					{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SELECTED_ENV')} <code>{configEnv.target}</code> {i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.NO_LONGER_EXISTS_PICK_ANOTHER')}
				</div>
			{/if}
		</div>
	{/if}
</div>
