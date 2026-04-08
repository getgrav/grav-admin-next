<script lang="ts">
	import MediaManager from '$lib/components/media/MediaManager.svelte';
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
</script>

<svelte:head>
	<title>Media — Grav Admin</title>
</svelte:head>

<div class="flex h-full flex-col">
	<!-- Header -->
	<StickyHeader noBorder>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">Media</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">Manage site-wide media files</p>
						{/if}
					</div>
				</div>
			</div>
		{/snippet}
	</StickyHeader>

	<!-- Manager fills remaining space -->
	<div class="flex-1 overflow-hidden">
		<MediaManager />
	</div>
</div>
