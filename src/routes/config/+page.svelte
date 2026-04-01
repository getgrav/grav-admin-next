<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() => {
		goto(`${base}/config/system`, { replaceState: true });
	});
</script>

<div class="py-20 text-center text-sm text-muted-foreground">Loading configuration...</div>
