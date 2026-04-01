<script lang="ts">
	import { mediaManager } from '$lib/stores/mediaManager.svelte';
	import MediaFileCard from './MediaFileCard.svelte';

	const { folders, files } = $derived(mediaManager);
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-4">
	{#each folders as folder (folder.path)}
		<MediaFileCard kind="folder" {folder} />
	{/each}
	{#each files as item, index (item.path + '/' + item.filename)}
		<MediaFileCard kind="file" {item} {index} />
	{/each}
</div>
