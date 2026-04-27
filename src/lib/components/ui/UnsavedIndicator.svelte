<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Loader2, Check } from 'lucide-svelte';

	interface Props {
		hasChanges: boolean;
		saving?: boolean;
		/** Set when autosave just persisted a change. Used to flash a brief "Saved" pill. */
		lastSavedAt?: number | null;
		/** When true, show the brief "Saved" / "Saving" feedback after autosave events. */
		autoSaveEnabled?: boolean;
	}

	let {
		hasChanges,
		saving = false,
		lastSavedAt = null,
		autoSaveEnabled = false,
	}: Props = $props();

	const showSaving = $derived(autoSaveEnabled && saving);
	const showSaved = $derived(autoSaveEnabled && !saving && !hasChanges && lastSavedAt != null);
	const showUnsaved = $derived(hasChanges && !showSaving);
</script>

{#if showSaving}
	<span
		class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
		title={i18n.t('ADMIN_NEXT.UNSAVED_INDICATOR.SAVING_CHANGES')}
		aria-label={i18n.t('ADMIN_NEXT.UNSAVED_INDICATOR.SAVING_CHANGES_2')}
	>
		<Loader2 size={12} class="animate-spin" />
	</span>
{:else if showSaved}
	<span
		class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
		title={i18n.t('ADMIN_NEXT.ALL_CHANGES_SAVED')}
		aria-label={i18n.t('ADMIN_NEXT.ALL_CHANGES_SAVED')}
	>
		<Check size={12} strokeWidth={2.5} />
	</span>
{:else if showUnsaved}
	<span
		class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10"
		title={i18n.t('ADMIN_NEXT.UNSAVED_INDICATOR.UNSAVED_CHANGES_CLICK_SAVE_TO_PERSIST')}
		aria-label={i18n.t('ADMIN_NEXT.UNSAVED_INDICATOR.YOU_HAVE_UNSAVED_CHANGES')}
	>
		<span class="relative flex h-2 w-2">
			<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70"></span>
			<span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
		</span>
	</span>
{/if}
