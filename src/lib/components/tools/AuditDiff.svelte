<script lang="ts">
	import { collapsedLineDiff, hasTextChange } from '$lib/utils/word-diff';

	// `changes` is the audit row's context.changes map:
	//   { <field>: { old: <value>, new: <value> }, ... }
	let { changes }: { changes: Record<string, { old: unknown; new: unknown }> } = $props();

	function str(v: unknown): string {
		if (v === null || v === undefined) return '';
		return typeof v === 'string' ? v : JSON.stringify(v);
	}

	const fields = $derived(Object.entries(changes ?? {}));
</script>

<div class="space-y-3">
	{#each fields as [field, change] (field)}
		<div class="overflow-hidden rounded-md border border-border">
			<div class="border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-[0.6875rem] font-medium text-muted-foreground">
				{field}
			</div>
			<div class="overflow-x-auto py-1 font-mono text-[0.6875rem] leading-relaxed">
				{#if hasTextChange(change.old, change.new)}
					{#each collapsedLineDiff(str(change.old), str(change.new)) as row, i (i)}
						{#if row.type === 'gap'}
							<div class="select-none bg-muted/30 px-3 py-0.5 text-center text-[0.625rem] text-muted-foreground">
								⋯ {row.count} unchanged {row.count === 1 ? 'line' : 'lines'} ⋯
							</div>
						{:else if row.type === 'del'}
							<div class="flex bg-red-500/10 text-red-700 dark:text-red-300">
								<span class="w-5 shrink-0 select-none px-1 text-center text-red-500/60">−</span>
								<span class="whitespace-pre-wrap break-words">{row.text || ' '}</span>
							</div>
						{:else if row.type === 'add'}
							<div class="flex bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
								<span class="w-5 shrink-0 select-none px-1 text-center text-emerald-500/60">+</span>
								<span class="whitespace-pre-wrap break-words">{row.text || ' '}</span>
							</div>
						{:else if row.type === 'replace'}
							<div class="flex">
								<span class="w-5 shrink-0 select-none px-1 text-center text-muted-foreground/50">~</span>
								<span class="whitespace-pre-wrap break-words">
									{#each row.segs ?? [] as seg, s (s)}{#if seg.type === 'added'}<span class="rounded-sm bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">{seg.text}</span>{:else if seg.type === 'removed'}<span class="rounded-sm bg-red-500/20 text-red-700 line-through decoration-red-500/50 dark:text-red-300">{seg.text}</span>{:else}<span class="text-foreground">{seg.text}</span>{/if}{/each}
								</span>
							</div>
						{:else}
							<div class="flex text-muted-foreground">
								<span class="w-5 shrink-0 select-none px-1"></span>
								<span class="whitespace-pre-wrap break-words">{row.text || ' '}</span>
							</div>
						{/if}
					{/each}
				{:else}
					<div class="px-3 text-muted-foreground">{str(change.new)}</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
