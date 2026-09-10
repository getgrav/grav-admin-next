<script lang="ts">
	import { AlertCircle, RefreshCw } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { i18n } from '$lib/stores/i18n.svelte';

	/**
	 * The end state of a load that failed: what failed, why, and a way to try
	 * again. Takes the place of a spinner that would otherwise have nothing to
	 * stop it (getgrav/grav-plugin-admin2#173).
	 */
	interface Props {
		/** What could not be loaded, already translated. */
		title: string;
		/** The error's own message, when there is one. */
		detail?: string;
		onretry: () => void;
	}

	let { title, detail = '', onretry }: Props = $props();
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center" role="alert">
	<AlertCircle size={24} class="text-destructive" />
	<div class="max-w-md space-y-1">
		<p class="text-sm font-medium text-foreground">{title}</p>
		{#if detail}
			<p class="text-xs text-muted-foreground">{detail}</p>
		{/if}
	</div>
	<Button variant="outline" size="sm" onclick={onretry}>
		<RefreshCw size={14} class="me-1.5" />
		{i18n.t('ADMIN_NEXT.RETRY')}
	</Button>
</div>
