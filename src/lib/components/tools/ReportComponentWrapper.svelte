<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { ReportItem } from '$lib/api/endpoints/tools';
	import { loadPluginModule } from '$lib/utils/plugin-modules';
	import { onMount } from 'svelte';

	interface Props {
		report: ReportItem;
	}

	let { report }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let loaded = $state(false);
	let error = $state('');

	// Web component tag name: grav-{pluginSlug}--{reportId}
	const tagName = `grav-${report.provider}--${report.component}`;

	async function loadComponent() {
		try {
			await loadPluginModule({
				type: 'report',
				slug: report.provider,
				name: report.component ?? undefined,
				tag: tagName,
				version: report.v,
			});
			loaded = true;
			mountElement();
		} catch (err) {
			console.error(`[ReportComponent] Failed to load ${report.provider}/${report.component}:`, err);
			error = `Failed to load report component "${report.component}"`;
		}
	}

	function mountElement() {
		if (!containerEl) return;

		containerEl.innerHTML = '';

		const el = document.createElement(tagName) as HTMLElement & {
			report?: ReportItem;
		};

		// Pass the full report data to the web component
		el.report = report;
		containerEl.appendChild(el);
	}

	onMount(() => {
		loadComponent();
	});
</script>

{#if error}
	<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
		{error}
	</div>
{:else if !loaded}
	<div class="flex h-16 items-center justify-center rounded-lg border border-dashed border-border">
		<span class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.TOOLS.REPORT_COMPONENT_WRAPPER.LOADING_REPORT_COMPONENT')}</span>
	</div>
{/if}

<div bind:this={containerEl}></div>
