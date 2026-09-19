<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { ShieldAlert, ChevronDown, ChevronUp, BellOff } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { scopedKey } from '$lib/utils/scopedStorage';
	import {
		SNOOZE_MS,
		bannerStateFor,
		classifyExposure,
		exposureSignature,
		type BannerState,
		type ProbeResult
	} from '$lib/api/security-probes';

	// `null` while undetermined / safe — the parent only renders this when an
	// exposure has been confirmed, but guard anyway.
	let {
		exposed = false,
		exposedFiles = [],
		results = []
	}: { exposed?: boolean; exposedFiles?: string[]; results?: ProbeResult[] } = $props();

	// Collapse and snooze are per-browser conveniences, tied to the set of exposed
	// files: if that set changes, the banner comes back in full.
	const STORAGE_KEY = scopedKey('grav_admin_security_banner');

	function load(): BannerState | null {
		try {
			return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
		} catch {
			return null;
		}
	}

	function save(state: BannerState) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch {
			// Storage unavailable: the change still holds for this page view.
		}
	}

	let saved = $state<BannerState | null>(load());

	const signature = $derived(exposureSignature(exposedFiles));
	const view = $derived(bannerStateFor(saved, signature));
	const pattern = $derived(classifyExposure(results));

	const BODY_KEYS = {
		tmp: 'ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_TMP',
		'by-type': 'ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_BY_TYPE',
		all: 'ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_ALL',
		unknown: 'ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_BODY'
	} as const;

	function setCollapsed(collapsed: boolean) {
		saved = { signature, collapsed };
		save(saved);
	}

	function snooze() {
		saved = { signature, collapsed: view.collapsed, snoozedUntil: Date.now() + SNOOZE_MS };
		save(saved);
	}
</script>

{#if exposed && !view.snoozed}
	<div
		class="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/40 {view.collapsed
			? 'px-4 py-2'
			: 'p-4'}"
		role="alert"
	>
		<div class="flex items-start gap-3">
			{#if view.collapsed}
				<ShieldAlert size={16} class="mt-1 shrink-0 text-amber-600 dark:text-amber-300" />
			{:else}
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
				>
					<ShieldAlert size={20} />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
					<p class="min-w-0 pt-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
						{i18n.t('ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_TITLE')}
						{#if view.collapsed && exposedFiles.length}
							<span class="ms-1 font-normal text-amber-700 dark:text-amber-200/80">
								({i18n.t('ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_COUNT', {
									n: exposedFiles.length
								})})
							</span>
						{/if}
					</p>
					<div class="-me-2 flex shrink-0 items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							class="h-7 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
							aria-expanded={!view.collapsed}
							onclick={() => setCollapsed(!view.collapsed)}
						>
							{#if view.collapsed}
								<ChevronDown size={14} />
								{i18n.t('ADMIN_NEXT.SECURITY_CHECK.SHOW_DETAILS')}
							{:else}
								<ChevronUp size={14} />
								{i18n.t('ADMIN_NEXT.SECURITY_CHECK.COLLAPSE')}
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
							title={i18n.t('ADMIN_NEXT.SECURITY_CHECK.SNOOZE_HINT')}
							onclick={snooze}
						>
							<BellOff size={14} />
							{i18n.t('ADMIN_NEXT.SECURITY_CHECK.SNOOZE')}
						</Button>
					</div>
				</div>
				{#if !view.collapsed}
					<p class="mt-1 text-sm text-amber-700 dark:text-amber-200/90">
						{i18n.t(BODY_KEYS[pattern])}
					</p>
					{#if exposedFiles.length}
						<ul class="mt-2 list-inside list-disc text-sm text-amber-800 dark:text-amber-200">
							{#each exposedFiles as path}
								<li><code>{path}</code></li>
							{/each}
						</ul>
					{/if}
					<p class="mt-2 text-sm text-amber-700 dark:text-amber-200/90">
						{i18n.t('ADMIN_NEXT.SECURITY_CHECK.STORAGE_EXPOSED_CDN')}
					</p>
					<a
						href="https://learn.getgrav.org/security/user-folder-exposure"
						target="_blank"
						rel="noopener noreferrer"
						class="mt-2 inline-block text-sm font-medium text-amber-800 underline underline-offset-2 hover:no-underline dark:text-amber-200"
					>
						{i18n.t('ADMIN_NEXT.SECURITY_CHECK.USER_FOLDER_EXPOSED_LEARN_MORE')}
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}
