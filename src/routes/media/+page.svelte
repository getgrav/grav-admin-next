<script lang="ts">
	import MediaManager from '$lib/components/media/MediaManager.svelte';
</script>

<svelte:head>
	<title>Media — Grav Admin</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-border px-6 py-4">
		<div>
			<h1 class="text-xl font-semibold text-foreground">Media</h1>
			<p class="mt-0.5 text-xs text-muted-foreground">Manage site-wide media files</p>
		</div>
	</div>

	<!-- Manager fills remaining space -->
	<div class="flex-1 overflow-hidden">
		<MediaManager />
	</div>
</div>
