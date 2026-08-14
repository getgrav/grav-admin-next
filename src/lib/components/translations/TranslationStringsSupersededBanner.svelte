<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { can } from '$lib/utils/permissions';
	import {
		getTranslationStringsImportStatus,
		type TranslationStringsImportStatus,
	} from '$lib/api/endpoints/translations';
	import { Languages, ArrowRight } from 'lucide-svelte';

	/**
	 * Shown on the translation-strings plugin screen, which is where anyone
	 * still using it goes to edit their strings. That makes it the one place a
	 * site owner is guaranteed to pass through, so it is where the move gets
	 * announced rather than in release notes nobody reads.
	 */
	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	const SLUG = 'translation-strings';

	let status = $state<TranslationStringsImportStatus | null>(null);

	onMount(async () => {
		if (slug !== SLUG || !can('api.translations.read')) return;
		try {
			status = await getTranslationStringsImportStatus();
		} catch {
			// The banner still says the useful thing without the counts.
			status = null;
		}
	});
</script>

{#if slug === SLUG}
	<div class="rounded-xl border border-primary/40 bg-primary/5 p-5">
		<div class="flex items-start gap-3">
			<div class="mt-0.5 shrink-0 text-primary">
				<Languages size={20} />
			</div>
			<div class="min-w-0 flex-1 space-y-2">
				<h3 class="text-sm font-medium text-foreground">
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.SUPERSEDED_TITLE')}
				</h3>
				<p class="text-sm leading-relaxed text-muted-foreground">
					{i18n.t('ADMIN_NEXT.TRANSLATIONS.SUPERSEDED_BODY')}
				</p>
				{#if status?.present && status.pending > 0}
					<p class="text-sm text-primary">
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.SUPERSEDED_PENDING', { count: status.pending })}
					</p>
				{/if}
				<div class="pt-1">
					<Button size="sm" onclick={() => goto(`${base}/translations`)}>
						{i18n.t('ADMIN_NEXT.TRANSLATIONS.SUPERSEDED_ACTION')}
						<ArrowRight size={14} class="ms-1.5" />
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
