<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { AlertTriangle } from 'lucide-svelte';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'destructive' | 'default';
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		open,
		title = 'Are you sure?',
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'default',
		onconfirm,
		oncancel,
	}: Props = $props();

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) oncancel();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={handleBackdrop}
	>
		<div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
			<div class="flex gap-4">
				{#if variant === 'destructive'}
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
						<AlertTriangle size={20} class="text-destructive" />
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<h3 class="text-base font-semibold text-foreground">{title}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">{message}</p>
				</div>
			</div>
			<div class="mt-5 flex justify-end gap-2">
				<Button variant="outline" size="sm" onclick={oncancel}>
					{cancelLabel}
				</Button>
				<Button variant={variant === 'destructive' ? 'destructive' : 'default'} size="sm" onclick={onconfirm}>
					{confirmLabel}
				</Button>
			</div>
		</div>
	</div>
{/if}
