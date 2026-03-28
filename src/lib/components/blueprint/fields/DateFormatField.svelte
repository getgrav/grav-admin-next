<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
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
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}
	<div class="relative">
		<select
			class="flex h-10 w-full appearance-none rounded-lg border border-input bg-muted/50 pl-3 pr-8 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			value={value ?? field.default ?? ''}
			onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
			disabled={field.disabled}
		>
			<option value="">— Select format —</option>
			{#each options as opt (opt.format)}
				<option value={opt.format} selected={String(value) === opt.format}>{opt.display}</option>
			{/each}
		</select>
		<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
			<ChevronsUpDown size={14} class="text-muted-foreground" />
		</div>
	</div>
	{#if currentDisplay}
		<p class="text-xs text-muted-foreground">Format string: <code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{value}</code></p>
	{/if}
</div>
