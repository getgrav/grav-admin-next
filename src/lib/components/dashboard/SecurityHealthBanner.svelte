<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ShieldAlert } from 'lucide-svelte';

	// `null` while undetermined / safe — the parent only renders this when an
	// exposure has been confirmed, but guard anyway.
	let { exposed = false }: { exposed?: boolean } = $props();
</script>

{#if exposed}
	<div
		class="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/40"
		role="alert"
	>
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
		>
			<ShieldAlert size={20} />
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-amber-800 dark:text-amber-200">
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_TITLE')}
			</p>
			<p class="mt-1 text-sm text-amber-700 dark:text-amber-200/90">
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_BODY')}
			</p>
			<a
				href="https://learn.getgrav.org/security/user-folder-exposure"
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-block text-sm font-medium text-amber-800 underline underline-offset-2 hover:no-underline dark:text-amber-200"
			>
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_LEARN_MORE')}
			</a>
		</div>
	</div>
{/if}
