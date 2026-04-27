<script lang="ts">
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { DatePicker } from 'bits-ui';
	import { CalendarDateTime, type DateValue } from '@internationalized/date';
	import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	/**
	 * Parse a date string into a CalendarDateTime.
	 * Handles common Grav date formats: ISO, d-m-Y H:i, m/d/Y h:i a, etc.
	 */
	function parseValue(val: unknown): CalendarDateTime | undefined {
		if (!val || typeof val !== 'string') return undefined;
		const str = val.trim();
		if (!str) return undefined;

		let d: Date | null = null;

		// 1. Try d-m-Y H:i(:s) — European format (must check before Date constructor)
		let match = str.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
		if (match) {
			const [, day, month, year, hour, min, sec] = match;
			const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
			d = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour || '0'), parseInt(min || '0'), parseInt(sec || '0'));
		}

		// 2. Try m/d/Y h:i a — US format with AM/PM
		if (!d || isNaN(d.getTime())) {
			match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
			if (match) {
				const [, month, day, year, hour, min, ampm] = match;
				const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
				let h = parseInt(hour);
				if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
				if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
				d = new Date(y, parseInt(month) - 1, parseInt(day), h, parseInt(min));
			}
		}

		// 3. Try m/d/Y H:i — US format with 24h time
		if (!d || isNaN(d.getTime())) {
			match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
			if (match) {
				const [, month, day, year, hour, min, sec] = match;
				const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
				d = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec || '0'));
			}
		}

		// 4. Try H:i d-m-Y or h:i a m/d/Y — time-first formats
		if (!d || isNaN(d.getTime())) {
			match = str.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
			if (match) {
				const [, hour, min, day, month, year] = match;
				const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
				d = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
			}
		}

		if (!d || isNaN(d.getTime())) {
			match = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i);
			if (match) {
				const [, hour, min, ampm, month, day, year] = match;
				const y = year.length <= 2 ? 2000 + parseInt(year) : parseInt(year);
				let h = parseInt(hour);
				if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
				if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
				d = new Date(y, parseInt(month) - 1, parseInt(day), h, parseInt(min));
			}
		}

		// 5. Fallback to Date constructor (handles ISO, Y-m-d, Y-m-d H:i:s, etc.)
		if (!d || isNaN(d.getTime())) {
			d = new Date(str);
		}

		if (!d || isNaN(d.getTime())) return undefined;

		return new CalendarDateTime(
			d.getFullYear(),
			d.getMonth() + 1,
			d.getDate(),
			d.getHours(),
			d.getMinutes(),
			d.getSeconds()
		);
	}

	/** Format CalendarDateTime to d-m-Y H:i for Grav storage (matches old admin format) */
	function formatForStorage(date: DateValue | undefined): string {
		if (!date) return '';
		const d = String(date.day).padStart(2, '0');
		const m = String(date.month).padStart(2, '0');
		const y = String(date.year);
		if ('hour' in date) {
			const dt = date as CalendarDateTime;
			const h = String(dt.hour).padStart(2, '0');
			const min = String(dt.minute).padStart(2, '0');
			return `${d}-${m}-${y} ${h}:${min}`;
		}
		return `${d}-${m}-${y}`;
	}

	let dateValue = $derived(parseValue(value));

	function handleValueChange(newValue: DateValue | undefined) {
		onchange(formatForStorage(newValue));
	}

	function handleClear() {
		onchange('');
	}

	const now = new Date();
	const placeholder = new CalendarDateTime(
		now.getFullYear(),
		now.getMonth() + 1,
		now.getDate(),
		12,
		0
	);
</script>

<div class="space-y-2">
	{#if field.label || field.help}
		<div>
			{#if field.label}
				<label class="text-sm font-semibold text-foreground">
					{translateLabel(field.label)}
					{#if field.validate?.required}
						<span class="text-red-500">*</span>
					{/if}
				</label>
			{/if}
			{#if field.help}
				<p class="mt-0.5 text-xs text-muted-foreground">{translateLabel(field.help)}</p>
			{/if}
		</div>
	{/if}

	<DatePicker.Root
		value={dateValue}
		onValueChange={handleValueChange}
		granularity="minute"
		hourCycle={24}
		{placeholder}
		weekStartsOn={1}
		fixedWeeks={true}
		disabled={field.disabled}
		readonly={field.readonly}
	>
		<div class="flex items-center gap-1.5">
			<DatePicker.Input
				class="flex h-10 flex-1 items-center gap-0.5 rounded-lg border border-input bg-muted/50 px-3 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring"
			>
				{#snippet children({ segments })}
					{#each segments as seg, i (i)}
						{#if seg.part === 'literal'}
							<span class="text-muted-foreground">{seg.value}</span>
						{:else}
							<DatePicker.Segment
								part={seg.part}
								class="inline rounded-sm px-0.5 py-0.5 text-foreground tabular-nums caret-transparent outline-none focus:bg-primary focus:text-primary-foreground"
							>{seg.value}</DatePicker.Segment>
						{/if}
					{/each}
				{/snippet}
			</DatePicker.Input>

			{#if dateValue && !field.validate?.required}
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={handleClear}
					aria-label={i18n.t('ADMIN_NEXT.FIELDS.CLEAR_DATE')}
				>
					<X size={14} />
				</button>
			{/if}

			<DatePicker.Trigger
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<CalendarIcon size={16} />
			</DatePicker.Trigger>
		</div>

		<DatePicker.Content
			class="z-50 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none"
			sideOffset={8}
		>
			<DatePicker.Calendar>
				{#snippet children({ months, weekdays })}
					<div class="flex flex-col gap-4">
						<DatePicker.Header class="flex items-center justify-between">
							<DatePicker.PrevButton
								class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								<ChevronLeft size={16} />
							</DatePicker.PrevButton>
							<DatePicker.Heading
								class="text-sm font-medium text-foreground"
							/>
							<DatePicker.NextButton
								class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								<ChevronRight size={16} />
							</DatePicker.NextButton>
						</DatePicker.Header>

						{#each months as month}
							<DatePicker.Grid class="w-full border-collapse">
								<DatePicker.GridHead>
									<DatePicker.GridRow class="flex w-full">
										{#each weekdays as weekday}
											<DatePicker.HeadCell
												class="w-9 text-center text-[0.8rem] font-medium text-muted-foreground"
											>
												{weekday}
											</DatePicker.HeadCell>
										{/each}
									</DatePicker.GridRow>
								</DatePicker.GridHead>
								<DatePicker.GridBody>
									{#each month.weeks as week}
										<DatePicker.GridRow class="flex w-full">
											{#each week as day}
												<DatePicker.Cell
													date={day}
													month={month.value}
													class="relative p-0 text-center"
												>
													<DatePicker.Day
														class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground/30 data-[outside-month]:pointer-events-none data-[outside-month]:text-muted-foreground/30 data-[selected]:bg-primary data-[selected]:font-semibold data-[selected]:text-primary-foreground data-[today]:border data-[today]:border-primary/40"
													/>
												</DatePicker.Cell>
											{/each}
										</DatePicker.GridRow>
									{/each}
								</DatePicker.GridBody>
							</DatePicker.Grid>
						{/each}
					</div>
				{/snippet}
			</DatePicker.Calendar>
		</DatePicker.Content>
	</DatePicker.Root>

	{#if field.description}
		<p class="text-xs text-muted-foreground">{translateLabel(field.description)}</p>
	{/if}
</div>
