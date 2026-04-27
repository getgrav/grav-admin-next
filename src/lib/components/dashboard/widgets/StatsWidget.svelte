<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { base } from '$app/paths';
	import { FileText, Users, Puzzle, Palette } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { getDashboardData } from '$lib/dashboard/context';
	import type { WidgetSize } from '$lib/dashboard/types';

	let { size = 'xl' as WidgetSize } = $props();

	const data = getDashboardData();
	const stats = $derived(data().stats);
	const updates = $derived(data().updates);
	const animated = $derived(data().animated);
	const totalUpdates = $derived(updates?.total ?? 0);

	let displayPages = $state(0);
	let displayUsers = $state(0);
	let displayPlugins = $state(0);

	function tween(target: number, set: (n: number) => void, duration = 700) {
		const startTime = performance.now();
		function tick(now: number) {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / duration, 1);
			const ease = 1 - Math.pow(1 - t, 3);
			set(Math.round(target * ease));
			if (t < 1) requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	}

	$effect(() => {
		if (!animated) {
			displayPages = 0; displayUsers = 0; displayPlugins = 0;
			return;
		}
		tween(stats?.pages.total ?? 0, n => displayPages = n);
		tween(stats?.users.total ?? 0, n => displayUsers = n);
		tween(stats?.plugins.total ?? 0, n => displayPlugins = n);
	});

	const cols = $derived(size === 'xl' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2');
</script>

{#if stats}
	<div class="grid gap-3 {cols}">
		<a href="{base}/pages" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
				<FileText size={36} />
			</div>
			<div class="min-w-0">
				<div class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{displayPages}</div>
				<div class="text-[12px] text-muted-foreground">Pages</div>
			</div>
		</a>

		<a href="{base}/users" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
				<Users size={36} />
			</div>
			<div class="min-w-0">
				<div class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{displayUsers}</div>
				<div class="text-[12px] text-muted-foreground">Users</div>
			</div>
		</a>

		<a href="{base}/plugins" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
				<Puzzle size={36} />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-3xl font-semibold tabular-nums leading-tight text-foreground">{displayPlugins}</span>
					{#if totalUpdates > 0}
						<Badge variant="default">{totalUpdates} update{totalUpdates > 1 ? 's' : ''}</Badge>
					{/if}
				</div>
				<div class="text-[12px] text-muted-foreground">{i18n.t('ADMIN_NEXT.NAV.PLUGINS')} <span class="text-foreground/50">({stats.plugins.active} active)</span></div>
			</div>
		</a>

		<a href="{base}/themes" class="group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:border-primary/30 hover:shadow-sm">
			<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
				<Palette size={36} />
			</div>
			<div class="min-w-0">
				<div class="text-lg font-semibold leading-tight text-foreground">{stats.theme}</div>
				<div class="text-[12px] text-muted-foreground">{i18n.t('ADMIN_NEXT.STATS_WIDGET.ACTIVE_THEME')}</div>
			</div>
		</a>
	</div>
{/if}
