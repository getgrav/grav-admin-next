<script lang="ts">
	import { renderMarkdownInline, sanitizeHtml } from '$lib/utils/markdown';
	import type { BlueprintField } from '$lib/api/endpoints/blueprints';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { DatePicker } from 'bits-ui';
	import { CalendarDateTime, type DateValue } from '@internationalized/date';
	import {
		formatDateTimeForStorage as formatForStorage,
		parseDateTimeValue as parseValue,
		toCalendar
	} from '$lib/utils/datetime-value';
	import { Calendar as CalendarIcon, Clock, X } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import FieldHelp from '../FieldHelp.svelte';

	interface Props {
		field: BlueprintField;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { field, value, onchange }: Props = $props();
	const translateLabel = i18n.tMaybe;

	/**
	 * Locale driving the order of the picker's segments. Without it bits-ui
	 * falls back to `en-US`, so the field reads month-day-year for everyone and
	 * typing a day above 12 into the first segment silently lands in the wrong
	 * one. Admin lang codes are already canonical BCP 47 (`en-US`, `pt-BR`), so
	 * they feed Intl directly. Deliberately the chosen admin language rather
	 * than the browser's locale: the admin has never picked date conventions up
	 * from the visitor's machine, and a setting the operator controls is easier
	 * to reason about than one that changes with whoever is logged in.
	 */
	const locale = $derived(i18n.lang || 'en-US');

	let dateValue = $derived(parseValue(value));

	function handleValueChange(newValue: DateValue | undefined) {
		onchange(formatForStorage(newValue));
	}

	function handleClear() {
		onchange('');
	}

	/** Fill the field with the current date and time. */
	function handleSetNow() {
		onchange(formatForStorage(toCalendar(new Date())));
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
			<FieldHelp help={field.help} label={field.label} />
		</div>
	{/if}

	<DatePicker.Root
		value={dateValue}
		onValueChange={handleValueChange}
		granularity="minute"
		hourCycle={24}
		{locale}
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

			{#if !field.disabled && !field.readonly}
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={handleSetNow}
					title={i18n.t('ADMIN_NEXT.FIELDS.SET_DATE_NOW')}
					aria-label={i18n.t('ADMIN_NEXT.FIELDS.SET_DATE_NOW')}
				>
					<Clock size={14} />
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
								<DirectionalIcon name="chevron-back" size={16} />
							</DatePicker.PrevButton>
							<DatePicker.Heading
								class="text-sm font-medium text-foreground"
							/>
							<DatePicker.NextButton
								class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								<DirectionalIcon name="chevron-forward" size={16} />
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
		{@const desc = translateLabel(field.description)}
		{#if field.markdown}
			<p class="text-xs text-muted-foreground">{@html renderMarkdownInline(desc)}</p>
		{:else}
			<p class="text-xs text-muted-foreground">{@html sanitizeHtml(desc)}</p>
		{/if}
	{/if}
</div>
