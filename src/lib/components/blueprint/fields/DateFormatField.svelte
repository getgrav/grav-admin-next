<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { sanitizeHtml } from '$lib/utils/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ChevronsUpDown } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const now = new Date();

	/**
	 * Format a date using PHP date format tokens.
	 * Supports the most common tokens used in Grav blueprints.
	 */
	function phpDateFormat(format: string, date: Date): string {
		const pad = (n: number) => n.toString().padStart(2, '0');

		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
		const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

		function ordinal(n: number): string {
			const s = ['th', 'st', 'nd', 'rd'];
			const v = n % 100;
			return n + (s[(v - 20) % 10] || s[v] || s[0]);
		}

		const tokens: Record<string, string> = {
			// Day
			d: pad(date.getDate()),
			D: dayShort[date.getDay()],
			j: String(date.getDate()),
			jS: ordinal(date.getDate()),
			l: dayNames[date.getDay()],
			N: String(date.getDay() || 7),
			S: ordinal(date.getDate()).slice(-2),
			w: String(date.getDay()),
			// Month
			F: monthNames[date.getMonth()],
			m: pad(date.getMonth() + 1),
			M: monthShort[date.getMonth()],
			n: String(date.getMonth() + 1),
			// Year
			Y: String(date.getFullYear()),
			y: String(date.getFullYear()).slice(-2),
			// Time
			a: date.getHours() < 12 ? 'am' : 'pm',
			A: date.getHours() < 12 ? 'AM' : 'PM',
			g: String(date.getHours() % 12 || 12),
			G: String(date.getHours()),
			h: pad(date.getHours() % 12 || 12),
			H: pad(date.getHours()),
			i: pad(date.getMinutes()),
			s: pad(date.getSeconds()),
		};

		let result = '';
		let i = 0;
		while (i < format.length) {
			if (format[i] === '\\' && i + 1 < format.length) {
				// Escaped character - output literal
				result += format[i + 1];
				i += 2;
			} else {
				// Check for two-char tokens first (jS)
				const twoChar = format.slice(i, i + 2);
				if (twoChar === 'jS') {
					result += tokens['jS'];
					i += 2;
				} else if (tokens[format[i]] !== undefined) {
					result += tokens[format[i]];
					i++;
				} else {
					result += format[i];
					i++;
				}
			}
		}

		return result;
	}

	const options = $derived(
		field.options?.length
			? field.options.map((opt) => ({
					format: opt.value,
					display: phpDateFormat(opt.value, now)
				}))
			: []
	);

	const currentDisplay = $derived(
		typeof value === 'string' && value ? phpDateFormat(value, now) : ''
	);

	// Grav's config accepts any PHP date format string, so the presets are a
	// convenience, not a limit. A saved value that isn't one of the presets is
	// treated as custom, and the "Custom…" option lets a user type their own.
	const presetFormats = $derived(new Set(options.map((o) => o.format)));
	const valueIsCustom = $derived(typeof value === 'string' && value !== '' && !presetFormats.has(value));
	// Sticky flag so the text input stays open after the user picks "Custom…"
	// even before they've typed anything (when the value is still a preset/empty).
	let customChosen = $state(false);
	const isCustom = $derived(customChosen || valueIsCustom);

	const CUSTOM_OPTION = '__custom__';

	// Local buffer for the custom input so the preview updates as you type while
	// the parent (auto-save / undo) is only notified on commit — dateformat is an
	// immediate-commit field, so committing per keystroke would spam the stack.
	// Re-syncs from `value` whenever we (re-)enter custom mode or it changes remotely.
	let customText = $state('');
	$effect(() => {
		if (isCustom) customText = typeof value === 'string' ? value : '';
	});
	const customPreview = $derived(customText ? phpDateFormat(customText, now) : '');

	function onSelectChange(v: string) {
		if (v === CUSTOM_OPTION) {
			// Enter custom mode without discarding the current value, so the text
			// input starts pre-filled with whatever preset was selected.
			customChosen = true;
			return;
		}
		customChosen = false;
		onchange(v);
	}
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{@html sanitizeHtml(translateLabel(field.help))}</p>
			{/if}
		</div>
	{/if}
	<div class="relative">
		<select
			class="flex h-10 w-full appearance-none rounded-lg border border-input bg-muted/50 ps-3 pe-8 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			value={isCustom ? CUSTOM_OPTION : (value ?? field.default ?? '')}
			onchange={(e) => onSelectChange((e.target as HTMLSelectElement).value)}
			disabled={field.disabled}
		>
			<option value="">{i18n.t('ADMIN_NEXT.FIELDS.DATE_FORMAT.SELECT_FORMAT')}</option>
			{#each options as opt (opt.format)}
				<option value={opt.format} selected={!isCustom && String(value) === opt.format}>{opt.display}</option>
			{/each}
			<option value={CUSTOM_OPTION} selected={isCustom}>{i18n.t('ADMIN_NEXT.FIELDS.DATE_FORMAT.CUSTOM')}</option>
		</select>
		<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pe-2.5">
			<ChevronsUpDown size={14} class="text-muted-foreground" />
		</div>
	</div>
	{#if isCustom}
		<input
			type="text"
			class="flex h-10 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			bind:value={customText}
			placeholder={i18n.t('ADMIN_NEXT.FIELDS.DATE_FORMAT.CUSTOM_PLACEHOLDER')}
			onchange={(e) => onchange((e.target as HTMLInputElement).value)}
			disabled={field.disabled}
		/>
		{#if customPreview}
			<p class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.DATE_FORMAT.PREVIEW')} {customPreview}</p>
		{/if}
	{:else if currentDisplay}
		<p class="text-xs text-muted-foreground">{i18n.t('ADMIN_NEXT.FIELDS.DATE_FORMAT.FORMAT_STRING')} <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.6875rem]">{value}</code></p>
	{/if}
</div>
