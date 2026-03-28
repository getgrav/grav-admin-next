<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { Clock, ChevronDown } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	const cronStr = $derived(typeof value === 'string' && value ? value : (field.default as string) ?? '* * * * *');

	// Parse cron into 5 parts: minute, hour, day-of-month, month, day-of-week
	function parseCron(cron: string): [string, string, string, string, string] {
		const parts = cron.trim().split(/\s+/);
		return [
			parts[0] ?? '*',
			parts[1] ?? '*',
			parts[2] ?? '*',
			parts[3] ?? '*',
			parts[4] ?? '*'
		];
	}

	const parts = $derived(parseCron(cronStr));

	let showAdvanced = $state(false);

	// Preset detection
	type Preset = 'every_minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

	function detectPreset(p: [string, string, string, string, string]): Preset {
		const [min, hr, dom, mon, dow] = p;
		if (min === '*' && hr === '*' && dom === '*' && mon === '*' && dow === '*') return 'every_minute';
		if (min !== '*' && hr === '*' && dom === '*' && mon === '*' && dow === '*') return 'hourly';
		if (min !== '*' && hr !== '*' && dom === '*' && mon === '*' && dow === '*') return 'daily';
		if (min !== '*' && hr !== '*' && dom === '*' && mon === '*' && dow !== '*') return 'weekly';
		if (min !== '*' && hr !== '*' && dom !== '*' && mon === '*' && dow === '*') return 'monthly';
		return 'custom';
	}

	const currentPreset = $derived(detectPreset(parts));

	// Human-readable description
	function describeCron(p: [string, string, string, string, string]): string {
		const [min, hr, dom, mon, dow] = p;
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

		const preset = detectPreset(p);
		const padMin = min.padStart(2, '0');
		const padHr = hr.padStart(2, '0');

		switch (preset) {
			case 'every_minute': return 'Every minute';
			case 'hourly': return `Every hour at :${padMin}`;
			case 'daily': return `Every day at ${padHr}:${padMin}`;
			case 'weekly': {
				const dayName = dayNames[parseInt(dow)] ?? dow;
				return `Every ${dayName} at ${padHr}:${padMin}`;
			}
			case 'monthly': return `Monthly on day ${dom} at ${padHr}:${padMin}`;
			default: return `${min} ${hr} ${dom} ${mon} ${dow}`;
		}
	}

	const description = $derived(describeCron(parts));

	function applyPreset(preset: Preset) {
		switch (preset) {
			case 'every_minute': onchange('* * * * *'); break;
			case 'hourly': onchange(`0 * * * *`); break;
			case 'daily': onchange(`0 ${parts[1] !== '*' ? parts[1] : '0'} * * *`); break;
			case 'weekly': onchange(`0 ${parts[1] !== '*' ? parts[1] : '0'} * * 1`); break;
			case 'monthly': onchange(`0 ${parts[1] !== '*' ? parts[1] : '0'} 1 * *`); break;
		}
	}

	function updatePart(index: number, val: string) {
		const newParts = [...parts] as [string, string, string, string, string];
		newParts[index] = val || '*';
		onchange(newParts.join(' '));
	}

	const presets: Array<{ value: Preset; label: string }> = [
		{ value: 'every_minute', label: 'Every minute' },
		{ value: 'hourly', label: 'Hourly' },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'custom', label: 'Custom' },
	];

	const hours = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: String(i).padStart(2, '0') }));
	const minutes = Array.from({ length: 60 }, (_, i) => ({ value: String(i), label: String(i).padStart(2, '0') }));
	const daysOfWeek = [
		{ value: '0', label: 'Sunday' },
		{ value: '1', label: 'Monday' },
		{ value: '2', label: 'Tuesday' },
		{ value: '3', label: 'Wednesday' },
		{ value: '4', label: 'Thursday' },
		{ value: '5', label: 'Friday' },
		{ value: '6', label: 'Saturday' },
	];
	const daysOfMonth = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
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

	<div class="rounded-lg border border-input bg-muted/50 shadow-sm">
		<!-- Summary bar -->
		<button
			type="button"
			class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
			onclick={() => showAdvanced = !showAdvanced}
		>
			<Clock size={14} class="shrink-0 text-muted-foreground" />
			<span class="flex-1 text-sm text-foreground">{description}</span>
			<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{cronStr}</code>
			<ChevronDown size={14} class="shrink-0 text-muted-foreground transition-transform {showAdvanced ? 'rotate-180' : ''}" />
		</button>

		{#if showAdvanced}
			<div class="space-y-3 border-t border-border px-3 py-3">
				<!-- Frequency preset -->
				<div class="flex flex-wrap items-center gap-1.5">
					{#each presets as preset (preset.value)}
						<button
							type="button"
							class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors
								{currentPreset === preset.value
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground hover:text-foreground'}"
							onclick={() => { if (preset.value !== 'custom') applyPreset(preset.value); }}
						>
							{preset.label}
						</button>
					{/each}
				</div>

				<!-- Contextual controls based on preset -->
				<div class="flex flex-wrap items-center gap-2 text-sm">
					{#if currentPreset === 'hourly'}
						<span class="text-muted-foreground">At minute</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[0]} onchange={(e) => updatePart(0, (e.target as HTMLSelectElement).value)}>
							{#each minutes as m}<option value={m.value}>{m.label}</option>{/each}
						</select>
					{:else if currentPreset === 'daily'}
						<span class="text-muted-foreground">At</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[1]} onchange={(e) => updatePart(1, (e.target as HTMLSelectElement).value)}>
							{#each hours as h}<option value={h.value}>{h.label}</option>{/each}
						</select>
						<span class="text-muted-foreground">:</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[0]} onchange={(e) => updatePart(0, (e.target as HTMLSelectElement).value)}>
							{#each minutes as m}<option value={m.value}>{m.label}</option>{/each}
						</select>
					{:else if currentPreset === 'weekly'}
						<span class="text-muted-foreground">On</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[4]} onchange={(e) => updatePart(4, (e.target as HTMLSelectElement).value)}>
							{#each daysOfWeek as d}<option value={d.value}>{d.label}</option>{/each}
						</select>
						<span class="text-muted-foreground">at</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[1]} onchange={(e) => updatePart(1, (e.target as HTMLSelectElement).value)}>
							{#each hours as h}<option value={h.value}>{h.label}</option>{/each}
						</select>
						<span class="text-muted-foreground">:</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[0]} onchange={(e) => updatePart(0, (e.target as HTMLSelectElement).value)}>
							{#each minutes as m}<option value={m.value}>{m.label}</option>{/each}
						</select>
					{:else if currentPreset === 'monthly'}
						<span class="text-muted-foreground">On day</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[2]} onchange={(e) => updatePart(2, (e.target as HTMLSelectElement).value)}>
							{#each daysOfMonth as d}<option value={d.value}>{d.label}</option>{/each}
						</select>
						<span class="text-muted-foreground">at</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[1]} onchange={(e) => updatePart(1, (e.target as HTMLSelectElement).value)}>
							{#each hours as h}<option value={h.value}>{h.label}</option>{/each}
						</select>
						<span class="text-muted-foreground">:</span>
						<select class="h-8 rounded-md border border-input bg-muted/50 px-2 text-sm" value={parts[0]} onchange={(e) => updatePart(0, (e.target as HTMLSelectElement).value)}>
							{#each minutes as m}<option value={m.value}>{m.label}</option>{/each}
						</select>
					{/if}
				</div>

				<!-- Raw cron input (always visible for full control) -->
				<div class="flex items-center gap-2">
					<span class="text-xs text-muted-foreground">Cron:</span>
					<input
						type="text"
						class="flex h-8 flex-1 rounded-md border border-input bg-muted/30 px-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						value={cronStr}
						placeholder="* * * * *"
						oninput={(e) => onchange((e.target as HTMLInputElement).value)}
					/>
					<span class="hidden text-[10px] text-muted-foreground/60 sm:block">min hr dom mon dow</span>
				</div>
			</div>
		{/if}
	</div>
</div>
