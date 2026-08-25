<script lang="ts">
	import { prefs } from '$lib/stores/preferences.svelte';
	import { faIconClass } from '$lib/utils/fa-icon';
</script>

{#each prefs.menubarLinks as link}
	{#if link.url}
		<a
			href={link.url}
			target={link.external ? '_blank' : undefined}
			rel={link.external ? 'noopener' : undefined}
			class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
			title={link.label}
		>
			{#if link.icon}
				<i class="{faIconClass(link.icon)} text-sm"></i>
			{:else}
				<i class="fa-solid fa-link text-sm"></i>
			{/if}
		</a>
	{/if}
{/each}
