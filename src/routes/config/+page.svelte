<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() => {
		goto(`${base}/config/system`, { replaceState: true });
	});
</script>

<div class="py-20 text-center text-sm text-muted-foreground">{i18n.t('ADMIN_NEXT.CONFIG.LOADING_CONFIGURATION')}</div>
