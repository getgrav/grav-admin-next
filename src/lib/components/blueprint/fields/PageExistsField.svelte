<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import FieldRenderer from '../FieldRenderer.svelte';
	import { api } from '$lib/api/client';
	import { i18n } from '$lib/stores/i18n.svelte';

	interface Props {
		field: BlueprintField;
		getValue: (path: string) => unknown;
		onFieldChange: (path: string, value: unknown) => void;
		onFieldCommit?: (path: string, value: unknown, oldValue?: unknown) => void;
	}

	let { field, getValue, onFieldChange, onFieldCommit }: Props = $props();
	const translateLabel = i18n.tMaybe;

	// Read the page route from the form data using the page_field reference
	const pageRoute = $derived(getValue((field as any).page_field) as string ?? '');
	const pageTemplate = $derived((field as any).page_template as string ?? '');
	const successMsg = $derived((field as any).success_msg as string ?? '');
	const errorMsg = $derived((field as any).error_msg as string ?? '');

	let checking = $state(false);
	let pageFound = $state(false);

	// Check page existence whenever the route value changes
	let prevRoute = '';
	$effect(() => {
		const route = pageRoute;
		const template = pageTemplate;

		// Only re-check when the route actually changes
		if (route === prevRoute) return;
		prevRoute = route;

		if (!route) {
			pageFound = false;
			checking = false;
			return;
		}

		checking = true;
		const trimmedRoute = route.replace(/^\//, '');
		const currentRoute = route;

		api.get<any>(`/pages/${trimmedRoute}`, { summary: 'true' })
			.then((page: any) => {
				if (currentRoute !== prevRoute) return; // stale
				pageFound = template && page?.template
					? page.template === template
					: true;
			})
			.catch(() => {
				if (currentRoute !== prevRoute) return; // stale
				pageFound = false;
			})
			.finally(() => {
				if (currentRoute === prevRoute) checking = false;
			});
	});
</script>

{#if field.fields}
	<div class="space-y-4">
		<!-- Status alert -->
		{#if checking}
			<div class="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300">
				{i18n.t('ADMIN_NEXT.FIELDS.PAGE_EXISTS.CHECKING_PAGE')}
			</div>
		{:else if pageFound}
			<div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
				{translateLabel(successMsg)}
			</div>
		{:else}
			<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
				{translateLabel(errorMsg)}
			</div>
		{/if}

		<!-- Nested fields with conditional overlay when page IS found -->
		<div class="relative">
			<div class="space-y-5">
				{#each field.fields as childField (childField.name)}
					<FieldRenderer
						field={childField}
						value={getValue(childField.name)}
						onchange={(val) => onFieldChange(childField.name, val)}
						oncommit={onFieldCommit ? (val: unknown, old?: unknown) => onFieldCommit(childField.name, val, old) : undefined}
						{getValue}
						{onFieldChange}
						{onFieldCommit}
					/>
				{/each}
			</div>

			{#if pageFound}
				<div class="absolute inset-0 z-10 rounded bg-background/50"></div>
			{/if}
		</div>
	</div>
{/if}
