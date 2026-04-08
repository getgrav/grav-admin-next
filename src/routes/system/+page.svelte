<script lang="ts">
	import StickyHeader from '$lib/components/ui/StickyHeader.svelte';
</script>

<svelte:head>
	<title>System — Grav Admin</title>
</svelte:head>

<div>
	<StickyHeader>
		{#snippet children({ scrolled })}
			<div class="px-6 transition-[padding] duration-200 {scrolled ? 'py-2' : 'pt-6 pb-3'}">
				<div class="flex items-center justify-between {scrolled ? 'min-h-6' : 'min-h-8'}">
					<div>
						<h1 class="font-semibold tracking-tight text-foreground transition-[font-size] duration-200 {scrolled ? 'text-sm' : 'text-xl'}">System</h1>
						{#if !scrolled}
							<p class="mt-0.5 text-xs text-muted-foreground">Coming soon</p>
						{/if}
					</div>
				</div>
			</div>
		{/snippet}
	</StickyHeader>
</div>
