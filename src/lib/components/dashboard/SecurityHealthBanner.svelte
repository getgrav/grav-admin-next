<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ShieldAlert } from 'lucide-svelte';

	// `null` while undetermined / safe — the parent only renders this when an
	// exposure has been confirmed, but guard anyway.
	let { exposed = false }: { exposed?: boolean } = $props();
</script>

{#if exposed}
	<div
		class="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive"
		role="alert"
	>
		<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15">
			<ShieldAlert size={20} />
		</div>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold">
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_TITLE')}
			</p>
			<p class="mt-1 text-sm text-destructive/90">
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_BODY')}
			</p>
			<a
				href="https://learn.getgrav.org/17/webservers-hosting"
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-block text-sm font-medium underline underline-offset-2 hover:no-underline"
			>
				{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_LEARN_MORE')}
			</a>
		</div>
	</div>
{/if}
