<script lang="ts">
	import { on } from 'svelte/events';
	import { prefs } from '$lib/stores/preferences.svelte';
	import HelpTip from '$lib/components/ui/HelpTip.svelte';
	import { guardLabelClick, nearbyLabelText } from '$lib/utils/help-tip';

	/**
	 * What `<grav-help>` draws inside its shadow root. The help itself is the
	 * element's own light-DOM children, shown through a `<slot>`, so a plugin's
	 * links and markup keep working and keep the plugin's own styling.
	 *
	 * Below the label mode draws a paragraph. Tooltip mode draws the same info
	 * icon and tooltip as core fields (HelpTip), with the slot inside the
	 * tooltip. The mode comes from the same store that sets `data-help-mode` on
	 * <html>, so it follows a change in Settings straight away.
	 */
	interface Props {
		/** The `<grav-help>` element itself. */
		host: HTMLElement;
		/** Its `label` attribute: the icon's accessible name, when it can't be worked out. */
		label: string;
	}

	let { host, label }: Props = $props();

	const tooltip = $derived(prefs.helpMode === 'tooltip');

	// The surrounding label is plain DOM, so there is nothing to react to: read
	// it when the icon first shows, then once more after the plugin has had a
	// moment to finish drawing its form.
	let name = $state('');
	$effect(() => {
		if (!tooltip) return;
		const read = () => (name = label || nearbyLabelText(host));
		read();
		const frame = requestAnimationFrame(read);
		return () => cancelAnimationFrame(frame);
	});

	let text = $state<HTMLElement>();
	$effect(() => {
		if (!text) return;
		return on(text, 'click', guardLabelClick);
	});
</script>

{#if tooltip}
	<HelpTip label={name}>
		<svelte:element this={'slot'} />
	</HelpTip>
{:else}
	<div bind:this={text} class="grav-help-text">
		<svelte:element this={'slot'} />
	</div>
{/if}
