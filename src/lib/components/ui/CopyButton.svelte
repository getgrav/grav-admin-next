<script lang="ts">
	import { Check, Copy } from 'lucide-svelte';

	interface Props {
		text: string;
		label?: string;
	}

	let { text, label = 'Copy' }: Props = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		} catch {
			// Fallback for non-secure contexts
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		}
	}
</script>

<button
	class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
	onclick={copy}
>
	{#if copied}
		<Check size={13} class="text-emerald-500" />
		Copied!
	{:else}
		<Copy size={13} />
		{label}
	{/if}
</button>
