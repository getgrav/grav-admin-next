<script lang="ts">
	// One marker for a page's publication status, shared by the tree, list and
	// Miller views so the four states read identically wherever they appear
	// (getgrav/grav-plugin-admin#2523).
	//
	// Deliberately says nothing about `visible` — the file/folder glyph next to
	// it already tints for that, and giving one icon two unrelated meanings is
	// the part of classic admin's page list that aged worst.
	import { cn } from '$lib/utils';
	import { pageStatus, type PageStatusSource } from '$lib/utils/pageStatus';

	interface Props {
		page: PageStatusSource;
		/** `icon` is the compact circle used in list rows; `pill` is the labelled chip. */
		variant?: 'icon' | 'pill';
		/** Icon size in px. Ignored by the pill variant. */
		size?: number;
		/**
		 * The row is selected and painted in the primary colour, so the marker
		 * has to invert instead of using its status colour, which would not
		 * survive on that background. The shape still carries the state.
		 */
		isActive?: boolean;
		/**
		 * The marker sits inside a control that already names the status (the
		 * publish toggle, which folds it into its own title and aria-label).
		 * Drop the duplicate tooltip and hide the glyph from screen readers so
		 * the two do not compete.
		 */
		decorative?: boolean;
		class?: string;
	}

	let { page, variant = 'icon', size = 14, isActive = false, decorative = false, class: className = '' }: Props = $props();

	const status = $derived(pageStatus(page));
</script>

{#if variant === 'pill'}
	<span
		class={cn(
			'inline-flex h-4 shrink-0 items-center rounded px-1 text-[0.5625rem] leading-none font-bold uppercase',
			isActive ? 'bg-primary-foreground/20 text-primary-foreground' : status.pillClass,
			className,
		)}
		title={status.title}
		aria-label={status.title}
	>
		{status.label}
	</span>
{:else if decorative}
	<status.icon {size} class={cn(isActive ? 'text-primary-foreground' : status.colorClass, className)} aria-hidden="true" />
{:else}
	<span class={cn('inline-flex', className)} title={status.title}>
		<status.icon
			{size}
			class={isActive ? 'text-primary-foreground' : status.colorClass}
			role="img"
			aria-label={status.title}
		/>
	</span>
{/if}
