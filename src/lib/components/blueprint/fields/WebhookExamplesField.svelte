<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import { auth } from '$lib/stores/auth.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();

	const baseUrl = $derived(`${auth.serverUrl}`);

	const triggerAllCmd = $derived(
		`curl -X POST "${baseUrl}/scheduler/webhook" \\\n  -H "X-API-Token: YOUR_TOKEN"`
	);
	const triggerJobCmd = $derived(
		`curl -X POST "${baseUrl}/scheduler/webhook?job=backup" \\\n  -H "X-API-Token: YOUR_TOKEN"`
	);
	const healthCmd = $derived(
		`curl "${baseUrl}/scheduler/health"`
	);
	const ghActionsExample = $derived(
		`- name: Trigger Scheduler\n  run: |\n    curl -X POST \${{ secrets.SITE_URL }}/scheduler/webhook \\\n      -H "X-API-Token: \${{ secrets.WEBHOOK_TOKEN }}"`
	);
</script>

<div class="space-y-4">
	<h4 class="text-sm font-semibold text-foreground">How to use webhooks:</h4>

	<div>
		<p class="mb-1.5 text-sm text-muted-foreground">Trigger all due jobs (respects schedule):</p>
		<div class="flex items-start gap-2">
			<code class="block flex-1 overflow-x-auto whitespace-pre rounded-md bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{triggerAllCmd}</code>
			<CopyButton text={triggerAllCmd} />
		</div>
	</div>

	<div>
		<p class="mb-1.5 text-sm text-muted-foreground">Force-run specific job (ignores schedule):</p>
		<div class="flex items-start gap-2">
			<code class="block flex-1 overflow-x-auto whitespace-pre rounded-md bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{triggerJobCmd}</code>
			<CopyButton text={triggerJobCmd} />
		</div>
	</div>

	<div>
		<p class="mb-1.5 text-sm text-muted-foreground">Check health status:</p>
		<div class="flex items-start gap-2">
			<code class="block flex-1 overflow-x-auto whitespace-pre rounded-md bg-muted px-3 py-2.5 font-mono text-xs text-foreground">{healthCmd}</code>
			<CopyButton text={healthCmd} />
		</div>
	</div>

	<div>
		<p class="mb-2 text-sm font-semibold text-foreground">GitHub Actions example:</p>
		<pre class="overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-xs text-foreground">{ghActionsExample}</pre>
	</div>
</div>
