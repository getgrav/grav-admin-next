<script lang="ts">
	// Direction-aware wrapper around lucide chevron / arrow icons.
	// In RTL, "forward" points left and "back" points right — the same icon
	// semantically reverses physical direction. Don't use this for vertical
	// chevrons (ChevronUp/ChevronDown) — those don't flip.
	import {
		ChevronLeft, ChevronRight,
		ChevronsLeft, ChevronsRight,
		ArrowLeft, ArrowRight,
	} from 'lucide-svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	type Name =
		| 'chevron-forward' | 'chevron-back'
		| 'chevrons-forward' | 'chevrons-back'
		| 'arrow-forward' | 'arrow-back';

	let {
		name,
		size = 16,
		class: className = '',
		strokeWidth,
	}: {
		name: Name;
		size?: number | string;
		class?: string;
		strokeWidth?: number;
	} = $props();

	const Icon = $derived.by(() => {
		const rtl = i18n.dir === 'rtl';
		switch (name) {
			case 'chevron-forward':  return rtl ? ChevronLeft : ChevronRight;
			case 'chevron-back':     return rtl ? ChevronRight : ChevronLeft;
			case 'chevrons-forward': return rtl ? ChevronsLeft : ChevronsRight;
			case 'chevrons-back':    return rtl ? ChevronsRight : ChevronsLeft;
			case 'arrow-forward':    return rtl ? ArrowLeft : ArrowRight;
			case 'arrow-back':       return rtl ? ArrowRight : ArrowLeft;
		}
	});
</script>

<Icon {size} class={className} {strokeWidth} />
