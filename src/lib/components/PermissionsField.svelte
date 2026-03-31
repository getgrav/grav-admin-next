<script lang="ts">
	import { getPermissionsBlueprint, type PermissionAction } from '$lib/api/endpoints/blueprints';
	import { Loader2, ChevronRight } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		value: Record<string, unknown>;
		onchange: (value: Record<string, unknown>) => void;
	}

	let { value, onchange }: Props = $props();

	let sections = $state<PermissionAction[]>([]);
	let loading = $state(true);
	let expandedSections = $state<Set<string>>(new Set());

	async function loadPermissions() {
		loading = true;
		try {
			sections = await getPermissionsBlueprint();
			// Auto-expand all top-level sections
			for (const s of sections) {
				expandedSections.add(s.name);
			}
			expandedSections = new Set(expandedSections);
		} catch {
			toast.error('Failed to load permissions');
		} finally {
			loading = false;
		}
	}

	function getPermValue(name: string): 'allowed' | 'denied' | 'unset' {
		const parts = name.split('.');
		let current: unknown = value;
		for (const part of parts) {
			if (current && typeof current === 'object') {
				current = (current as Record<string, unknown>)[part];
			} else {
				return 'unset';
			}
		}
		if (current === true) return 'allowed';
		if (current === false) return 'denied';
		return 'unset';
	}

	function setPermValue(name: string, newVal: 'allowed' | 'denied' | 'unset') {
		const parts = name.split('.');
		const updated = structuredClone(value);
		let current: Record<string, unknown> = updated;

		// Navigate to parent
		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			if (typeof current[key] !== 'object' || current[key] === null) {
				current[key] = {};
			}
			current = current[key] as Record<string, unknown>;
		}

		const lastKey = parts[parts.length - 1];
		if (newVal === 'allowed') {
			current[lastKey] = true;
		} else if (newVal === 'denied') {
			current[lastKey] = false;
		} else {
			delete current[lastKey];
		}

		onchange(updated);
	}

	function toggleSection(name: string) {
		if (expandedSections.has(name)) {
			expandedSections.delete(name);
		} else {
			expandedSections.add(name);
		}
		expandedSections = new Set(expandedSections);
	}

	$effect(() => {
		loadPermissions();
	});
</script>

{#if loading}
	<div class="flex items-center justify-center py-8">
		<Loader2 size={20} class="animate-spin text-muted-foreground" />
	</div>
{:else}
	<div class="space-y-3">
		{#each sections as section}
			<div class="rounded-lg border border-border">
				<!-- Section header -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="flex cursor-pointer items-center gap-2 px-4 py-2.5"
					onclick={() => toggleSection(section.name)}
				>
					<ChevronRight
						size={14}
						class="shrink-0 text-muted-foreground transition-transform {expandedSections.has(section.name) ? 'rotate-90' : ''}"
					/>
					<span class="text-sm font-semibold text-foreground">{section.label}</span>
				</div>

				{#if expandedSections.has(section.name) && section.children}
					<div class="border-t border-border">
						{#each section.children as action, i}
							{@const permName = action.name}
							{@const currentVal = getPermValue(permName)}
							<div class="flex items-center justify-between px-4 py-2 {i > 0 ? 'border-t border-border/50' : ''}">
								<span class="text-sm text-foreground">{action.label}</span>
								<div class="flex overflow-hidden rounded-md border border-border text-xs">
									<button
										type="button"
										class="px-2.5 py-1 transition-colors {currentVal === 'allowed' ? 'bg-green-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}"
										onclick={() => setPermValue(permName, currentVal === 'allowed' ? 'unset' : 'allowed')}
									>
										Allow
									</button>
									<button
										type="button"
										class="border-x border-border px-2.5 py-1 transition-colors {currentVal === 'unset' ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}"
										onclick={() => setPermValue(permName, 'unset')}
									>
										—
									</button>
									<button
										type="button"
										class="px-2.5 py-1 transition-colors {currentVal === 'denied' ? 'bg-red-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}"
										onclick={() => setPermValue(permName, currentVal === 'denied' ? 'unset' : 'denied')}
									>
										Deny
									</button>
								</div>
							</div>

							<!-- Nested children -->
							{#if action.children}
								{#each action.children as child}
									{@const childName = child.name}
									{@const childVal = getPermValue(childName)}
									<div class="flex items-center justify-between border-t border-border/50 py-2 pl-10 pr-4">
										<span class="text-xs text-muted-foreground">{child.label}</span>
										<div class="flex overflow-hidden rounded-md border border-border text-xs">
											<button
												type="button"
												class="px-2 py-0.5 transition-colors {childVal === 'allowed' ? 'bg-green-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}"
												onclick={() => setPermValue(childName, childVal === 'allowed' ? 'unset' : 'allowed')}
											>
												Allow
											</button>
											<button
												type="button"
												class="border-x border-border px-2 py-0.5 transition-colors {childVal === 'unset' ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}"
												onclick={() => setPermValue(childName, 'unset')}
											>
												—
											</button>
											<button
												type="button"
												class="px-2 py-0.5 transition-colors {childVal === 'denied' ? 'bg-red-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}"
												onclick={() => setPermValue(childName, childVal === 'denied' ? 'unset' : 'denied')}
											>
												Deny
											</button>
										</div>
									</div>
								{/each}
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
