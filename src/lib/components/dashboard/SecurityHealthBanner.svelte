<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ShieldAlert } from 'lucide-svelte';

	// `null` while undetermined / safe — the parent only renders this when an
	// exposure has been confirmed, but guard anyway.
	let { exposed = false }: { exposed?: boolean } = $props();
</script>

{#if exposed}
	<div
		class="mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-950/40"
		role="alert"
	>
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300"
		>
			<ShieldAlert size={20} />
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-red-800 dark:text-red-200">
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_TITLE')}
			</p>
			<p class="mt-1 text-sm text-red-700 dark:text-red-200/90">
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_BODY')}
			</p>
			<a
				href="https://learn.getgrav.org/webservers-hosting/servers"
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-block text-sm font-medium text-red-800 underline underline-offset-2 hover:no-underline dark:text-red-200"
			>
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_LEARN_MORE')}
			</a>
		</div>
	</div>
{/if}
