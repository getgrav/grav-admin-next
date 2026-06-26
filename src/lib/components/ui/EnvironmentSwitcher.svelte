<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { configEnv } from '$lib/stores/configEnvironment.svelte';
	import { invalidations } from '$lib/stores/invalidation.svelte';
	import { dialogs } from '$lib/stores/dialogs.svelte';
	import { canWrite } from '$lib/utils/permissions';
	import { hasUnsavedChanges } from '$lib/utils/unsaved-guard.svelte';
	import { ChevronDown, Plus, Check, Trash2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { onMount, tick } from 'svelte';

	let open = $state(false);
	let creating = $state(false);
	let showCreateInput = $state(false);
	let newName = $state('');
	let createInputEl: HTMLInputElement | undefined = $state();
	let confirmDelete = $state<string | null>(null);
	let deleting = $state(false);

	onMount(() => {
		configEnv.load().catch(() => { /* non-fatal */ });
		const unsub = invalidations.subscribe('system:environments', () => {
			configEnv.load().catch(() => {});
		});
		return () => unsub();
	});

	async function select(name: string) {
		open = false;
		if (name === configEnv.target) return;
		// Switching the active environment re-runs the whole admin via a full
		// reload, which would discard any in-progress edit. Confirm first when
		// something is dirty (the SvelteKit nav guard can't cover a reload).
		if (hasUnsavedChanges()) {
			const ok = await dialogs.confirm({
				title: i18n.t('ADMIN_NEXT.UNSAVED_CHANGES'),
				message: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SWITCH_DISCARDS_UNSAVED'),
				confirmLabel: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SWITCH_AND_RELOAD'),
				cancelLabel: i18n.t('ADMIN_NEXT.CANCEL'),
				variant: 'destructive',
			});
			if (!ok) return;
		}
		configEnv.setTarget(name); // persists the choice and reloads the admin
	}

	async function showCreate() {
		// Only pre-fill the detected host name when it isn't already an env, so
		// we don't offer to "create" something that exists. Otherwise start blank.
		newName = canCreateDetected ? configEnv.detected : '';
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
			toast.success(i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.ENV_CREATED', { name }));
			showCreateInput = false;
			open = false;
		} catch (e) {
			const msg = e && typeof e === 'object' && 'message' in e
				? (e as { message: string }).message
				: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.FAILED_TO_CREATE');
			toast.error(msg);
		} finally {
			creating = false;
		}
	}

	async function submitDelete(name: string) {
		deleting = true;
		try {
			await configEnv.deleteEnvironment(name);
			toast.success(i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.ENV_DELETED', { name }));
			confirmDelete = null;
		} catch (e) {
			const msg = e && typeof e === 'object' && 'message' in e
				? (e as { message: string }).message
				: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.FAILED_TO_DELETE');
			toast.error(msg);
		} finally {
			deleting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (confirmDelete) {
				confirmDelete = null;
			} else if (showCreateInput) {
				showCreateInput = false;
			} else {
				open = false;
			}
		}
	}

	const canManage = $derived(canWrite('config'));
	const badgeLabel = $derived(configEnv.target === '' ? i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.DEFAULT') : configEnv.target);
	// The detected host env is worth offering to create only when no env folder
	// for it exists yet; otherwise the create row falls back to a generic label.
	const canCreateDetected = $derived(
		configEnv.detected !== '' &&
		!configEnv.environments.some((e) => e.name === configEnv.detected),
	);
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
		class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium transition-colors
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
			<div class="px-3 pb-1 pt-1 text-[0.625rem] uppercase tracking-wide text-muted-foreground/70">
				{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SAVE_CONFIG_TO')}
			</div>

			{#each configEnv.environments as env}
				{#if confirmDelete === env.name}
					<div class="flex w-full items-center gap-2 bg-destructive/10 px-3 py-1.5 text-[0.75rem]">
						<span class="flex-1 text-destructive">
							{env.hasOverrides
								? i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CONFIRM_DELETE_WITH_OVERRIDES', { name: env.name })
								: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CONFIRM_DELETE', { name: env.name })}
						</span>
						<button
							type="button"
							class="h-6 rounded px-2 text-[0.6875rem] text-muted-foreground hover:bg-muted disabled:opacity-50"
							disabled={deleting}
							onclick={() => confirmDelete = null}
						>{i18n.t('ADMIN_NEXT.CANCEL')}</button>
						<button
							type="button"
							class="h-6 rounded bg-destructive px-2 text-[0.6875rem] font-medium text-destructive-foreground disabled:opacity-50"
							disabled={deleting}
							onclick={() => submitDelete(env.name)}
						>{deleting ? '…' : i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.DELETE')}</button>
					</div>
				{:else}
					<div class="group flex w-full items-stretch">
						<button
							type="button"
							class="flex flex-1 items-center gap-2 whitespace-nowrap px-3 py-1.5 text-start text-[0.8125rem] transition-colors
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
								<span class="text-[0.625rem] text-muted-foreground">{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.HAS_OVERRIDES')}</span>
							{/if}
						</button>
						{#if canManage && env.name !== '' && env.name !== configEnv.detected}
							<button
								type="button"
								class="flex items-center px-2 text-muted-foreground/60 opacity-0 transition hover:text-destructive group-hover:opacity-100"
								title={i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.DELETE_ENV_TOOLTIP', { name: env.name })}
								onclick={() => confirmDelete = env.name}
							>
								<Trash2 size={13} />
							</button>
						{/if}
					</div>
				{/if}
			{/each}

			{#if canManage}
			<div class="mt-1 border-t border-border pt-1">
				{#if !showCreateInput}
					<button
						type="button"
						class="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-start text-[0.8125rem] text-popover-foreground transition-colors hover:bg-accent/50"
						onclick={showCreate}
					>
						<Plus size={13} />
						<span>
							{canCreateDetected
								? i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CREATE_ENV_NAMED', { name: configEnv.detected })
								: i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CREATE_ENVIRONMENT')}
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
							class="h-7 flex-1 rounded border border-border bg-background px-2 text-[0.75rem] focus:outline-none focus:ring-1 focus:ring-primary"
							pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
						/>
						<button
							type="submit"
							class="h-7 rounded bg-primary px-2 text-[0.6875rem] font-medium text-primary-foreground disabled:opacity-50"
							disabled={creating || !newName.trim()}
						>{creating ? '…' : i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CREATE')}</button>
					</form>
					<p class="px-3 pb-1 text-[0.625rem] text-muted-foreground">
						{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.CREATES_PATH', { name: newName || '<name>' })}
					</p>
				{/if}
			</div>
			{/if}

			{#if targetIsMissing}
				<div class="mt-1 border-t border-border px-3 py-1.5 text-[0.6875rem] text-destructive">
					{i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.SELECTED_ENV')} <code>{configEnv.target}</code> {i18n.t('ADMIN_NEXT.ENVIRONMENT_SWITCHER.NO_LONGER_EXISTS_PICK_ANOTHER')}
				</div>
			{/if}
		</div>
	{/if}
</div>
