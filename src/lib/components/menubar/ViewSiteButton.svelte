<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte';
	import { Globe, ExternalLink } from 'lucide-svelte';

	// When running as the admin2 plugin (SPA mounted at e.g. /grav/admin),
	// the frontend lives at the Grav site root (e.g. /grav). That's exactly
	// what `auth.serverUrl` points at — the configured Grav server URL.
	// When running standalone dev against a remote Grav, this still opens
	// the correct frontend.
	const siteUrl = $derived(auth.serverUrl || '/');
</script>

<a
	href={siteUrl}
	target="_blank"
	rel="noopener noreferrer"
	class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
	title="Open site frontend in a new tab"
>
	<Globe size={13} />
	<span>View site</span>
	<ExternalLink size={11} class="text-muted-foreground/60" />
</a>
