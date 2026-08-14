<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { can, canWrite } from '$lib/utils/permissions';
	import { saveConfig, getConfig } from '$lib/api/endpoints/config';
	import {
		getTranslationStringsImportStatus,
		importTranslationStrings,
		type TranslationStringsImportStatus,
	} from '$lib/api/endpoints/translations';
	import { ArrowDownToLine, TriangleAlert, PowerOff, Loader2, CheckCircle2 } from 'lucide-svelte';

	interface Props {
		/** Fires after a successful import so the matrix can refetch. */
		onimported?: () => void;
	}

	let { onimported }: Props = $props();

	let status = $state<TranslationStringsImportStatus | null>(null);
	let busy = $state(false);
	let disabling = $state(false);
	let expanded = $state(false);

	/**
	 * Two things can need doing, and they are independent: overrides still
	 * sitting only in the old plugin, and the plugin still being switched on.
	 * The second matters even after a clean import, because translation-strings
	 * merges *after* this store and so keeps winning — an editor that saves
	 * successfully and changes nothing on the site is the worst outcome here.
	 */
	const hasPending = $derived((status?.pending ?? 0) > 0);
	const stillWinning = $derived(status?.plugin_enabled === true);
	const show = $derived(status?.present === true && (hasPending || stillWinning));

	const canImport = $derived(can('api.translations.write'));
	const canDisable = $derived(canWrite('config'));

	const conflicts = $derived(
		(status?.languages ?? []).reduce((sum, l) => sum + l.conflict, 0)
	);
	const unknown = $derived((status?.languages ?? []).reduce((sum, l) => sum + l.unknown, 0));

	async function load() {
		try {
			status = await getTranslationStringsImportStatus();
		} catch {
			// A site with no translation-strings history is the common case and
			// this is an entirely optional affordance, so a failure here stays
			// silent rather than throwing an error banner at everyone.
			status = null;
		}
	}

	onMount(load);

	async function runImport() {
		busy = true;
		try {
			const result = await importTranslationStrings();
			toast.success(
				i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_DONE', { count: result.imported })
			);
			if (result.unknown.length > 0) {
				toast.warning(
					i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_UNKNOWN_WARNING', {
						count: result.unknown.length,
					})
				);
			}
			await load();
			onimported?.();
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_FAILED')
			);
		} finally {
			busy = false;
		}
	}

	async function disablePlugin() {
		disabling = true;
		try {
			// Read first for the ETag: this is a plain config PATCH through the
			// normal endpoint, so it carries the same concurrency and audit
			// behaviour as editing the plugin from the Plugins screen.
			const current = await getConfig('plugins/translation-strings');
			await saveConfig('plugins/translation-strings', { enabled: false }, current.etag);
			toast.success(i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_PLUGIN_DISABLED'));
			await load();
			onimported?.();
		} catch (e) {
			toast.error(
				e instanceof Error ? e.message : i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_DISABLE_FAILED')
			);
		} finally {
			disabling = false;
		}
	}
</script>

{#if show && status}
	<div class="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
		<div class="flex items-start gap-3">
			<div class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">
				{#if hasPending}
					<ArrowDownToLine size={18} />
				{:else}
					<TriangleAlert size={18} />
				{/if}
			</div>

			<div class="min-w-0 flex-1 space-y-2">
				<h3 class="text-sm font-medium text-foreground">
					{hasPending
						? i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_TITLE')
						: i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_STILL_ENABLED_TITLE')}
				</h3>

				{#if hasPending}
					<p class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_BODY', {
							count: status.pending,
							languages: status.languages.length,
						})}
					</p>
					{#if conflicts > 0}
						<!--
							Both stores naming the same key with different values is
							the one case where importing changes something the site
							owner did on purpose, so it is called out before, not after.
						-->
						<p class="text-xs text-amber-700 dark:text-amber-300">
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_CONFLICTS', { count: conflicts })}
						</p>
					{/if}
				{:else}
					<p class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_STILL_ENABLED_BODY')}
					</p>
				{/if}

				{#if expanded}
					<div class="space-y-2 rounded border border-border bg-background/60 p-3">
						<p class="font-mono text-[11px] text-muted-foreground">{status.config_path}</p>
						<table class="w-full text-xs">
							<thead>
								<tr class="text-start text-[10px] uppercase tracking-wider text-muted-foreground">
									<th class="pe-3 text-start font-medium">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_COL_LANGUAGE')}
									</th>
									<th class="pe-3 text-start font-medium">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_COL_NEW')}
									</th>
									<th class="pe-3 text-start font-medium">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_COL_CONFLICT')}
									</th>
									<th class="pe-3 text-start font-medium">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_COL_ALREADY')}
									</th>
									<th class="pe-3 text-start font-medium">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_COL_SHIPPED')}
									</th>
									<th class="text-start font-medium">
										{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_COL_UNKNOWN')}
									</th>
								</tr>
							</thead>
							<tbody class="tabular-nums">
								{#each status.languages as language (language.code)}
									<tr>
										<td class="pe-3 font-mono">{language.code}</td>
										<td class="pe-3">{language.new}</td>
										<td class="pe-3">{language.conflict}</td>
										<td class="pe-3 text-muted-foreground">{language.already}</td>
										<td class="pe-3 text-muted-foreground">{language.shipped}</td>
										<td class="text-muted-foreground">{language.unknown}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						<p class="text-[11px] text-muted-foreground">
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_LEGEND')}
						</p>
					</div>
				{/if}

				<div class="flex flex-wrap items-center gap-2 pt-1">
					{#if hasPending}
						<Button size="sm" onclick={runImport} disabled={busy || !canImport}>
							{#if busy}
								<Loader2 size={14} class="me-1.5 animate-spin" />
							{:else}
								<ArrowDownToLine size={14} class="me-1.5" />
							{/if}
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_ACTION')}
						</Button>
					{:else}
						<span class="flex items-center gap-1 text-xs text-muted-foreground">
							<CheckCircle2 size={13} class="text-emerald-600 dark:text-emerald-400" />
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_ALREADY_DONE', { count: status.total })}
						</span>
					{/if}

					{#if stillWinning}
						<Button
							size="sm"
							variant="outline"
							onclick={disablePlugin}
							disabled={disabling || !canDisable || hasPending}
							title={hasPending
								? i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_DISABLE_BLOCKED')
								: undefined}
						>
							{#if disabling}
								<Loader2 size={14} class="me-1.5 animate-spin" />
							{:else}
								<PowerOff size={14} class="me-1.5" />
							{/if}
							{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_DISABLE_ACTION')}
						</Button>
					{/if}

					<button
						type="button"
						class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
						onclick={() => (expanded = !expanded)}
					>
						{expanded
							? i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_HIDE_DETAIL')
							: i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_SHOW_DETAIL')}
					</button>
				</div>

				{#if hasPending && !canImport}
					<p class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_NO_PERMISSION')}
					</p>
				{:else if stillWinning && !hasPending && !canDisable}
					<p class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_NO_CONFIG_PERMISSION')}
					</p>
				{/if}

				{#if unknown > 0 && expanded}
					<p class="text-xs text-muted-foreground">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.IMPORT_UNKNOWN_NOTE', { count: unknown })}
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
