<script lang="ts">
	import {
		getApiKeys,
		createApiKey,
		deleteApiKey,
		type ApiKeyInfo,
	} from '$lib/api/endpoints/users';
	import { Button } from '$lib/components/ui/button';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import { toast } from 'svelte-sonner';
	import { Loader2, Trash2, KeyRound, Copy, Check, AlertTriangle } from 'lucide-svelte';

	interface Props {
		username: string;
	}

	let { username }: Props = $props();

	let keys = $state<ApiKeyInfo[]>([]);
	let loadingKeys = $state(true);

	// Generate form
	let newKeyName = $state('');
	let newKeyExpiry = $state('');
	let generating = $state(false);
	let generatedKey = $state('');
	let copied = $state(false);

	// Revoke confirm
	let confirmRevokeOpen = $state(false);
	let revokeTarget = $state<ApiKeyInfo | null>(null);
	let revoking = $state(false);

	function formatDate(ts: number | null): string {
		if (!ts) return 'Never';
		const d = new Date(ts * 1000);
		return d.toLocaleDateString(undefined, {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}) + ' ' + d.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		});
	}

	async function loadKeys() {
		loadingKeys = true;
		try {
			keys = await getApiKeys(username);
		} catch {
			toast.error('Failed to load API keys');
		} finally {
			loadingKeys = false;
		}
	}

	async function handleGenerate() {
		if (!newKeyName.trim()) {
			toast.error('Please enter a key name');
			return;
		}
		generating = true;
		generatedKey = '';
		try {
			const expiry = newKeyExpiry ? parseInt(newKeyExpiry, 10) : undefined;
			const result = await createApiKey(username, newKeyName.trim(), expiry);
			generatedKey = result.api_key;
			newKeyName = '';
			newKeyExpiry = '';
			await loadKeys();
			toast.success('API key generated');
		} catch {
			toast.error('Failed to generate API key');
		} finally {
			generating = false;
		}
	}

	function handleRevoke(key: ApiKeyInfo) {
		revokeTarget = key;
		confirmRevokeOpen = true;
	}

	async function confirmRevoke() {
		if (!revokeTarget) return;
		confirmRevokeOpen = false;
		revoking = true;
		try {
			await deleteApiKey(username, revokeTarget.id);
			await loadKeys();
			toast.success(`API key "${revokeTarget.name}" revoked`);
		} catch {
			toast.error('Failed to revoke API key');
		} finally {
			revoking = false;
			revokeTarget = null;
		}
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(generatedKey);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		} catch {
			toast.error('Failed to copy to clipboard');
		}
	}

	$effect(() => {
		username; // track
		loadKeys();
	});
</script>

<div class="rounded-xl border border-border bg-card p-5">
	<h2 class="text-sm font-semibold text-foreground">API Keys</h2>

	<div class="mt-4">
		{#if loadingKeys}
			<div class="flex items-center justify-center py-6">
				<Loader2 size={20} class="animate-spin text-muted-foreground" />
			</div>
		{:else if keys.length === 0}
			<p class="py-4 text-sm text-muted-foreground">No API keys have been generated yet.</p>
		{:else}
			<!-- Keys table -->
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
							<th class="pb-2 pr-4">Name</th>
							<th class="pb-2 pr-4">Key Prefix</th>
							<th class="pb-2 pr-4">Created</th>
							<th class="pb-2 pr-4">Expires</th>
							<th class="pb-2 pr-4">Last Used</th>
							<th class="pb-2 w-16"></th>
						</tr>
					</thead>
					<tbody>
						{#each keys as key (key.id)}
							<tr class="border-b border-border/50 last:border-0">
								<td class="py-2.5 pr-4 font-medium text-foreground">{key.name}</td>
								<td class="py-2.5 pr-4">
									<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{key.prefix}</code>
								</td>
								<td class="py-2.5 pr-4 text-muted-foreground">{formatDate(key.created)}</td>
								<td class="py-2.5 pr-4 text-muted-foreground">{formatDate(key.expires)}</td>
								<td class="py-2.5 pr-4 text-muted-foreground">{formatDate(key.last_used)}</td>
								<td class="py-2.5">
									<button
										type="button"
										class="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
										onclick={() => handleRevoke(key)}
										disabled={revoking}
										title="Revoke key"
									>
										<Trash2 size={14} />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<!-- Generated key display -->
		{#if generatedKey}
			<div class="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
				<div class="flex items-center gap-2">
					<input
						type="text"
						readonly
						value={generatedKey}
						class="flex-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-sm text-foreground focus:outline-none"
					/>
					<Button variant="outline" size="sm" onclick={copyToClipboard} class="shrink-0">
						{#if copied}
							<Check size={14} class="text-green-500" />
						{:else}
							<Copy size={14} />
						{/if}
					</Button>
				</div>
				<p class="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
					<AlertTriangle size={12} />
					Copy this key now — it will not be shown again.
				</p>
			</div>
		{/if}

		<!-- Generate form -->
		<div class="mt-4 flex flex-wrap items-end gap-3 border-t border-border/50 pt-4">
			<div class="min-w-0 flex-1">
				<label class="text-xs font-medium text-muted-foreground" for="api-key-name">Key Name</label>
				<input
					id="api-key-name"
					type="text"
					bind:value={newKeyName}
					placeholder="e.g. My CLI Tool"
					class="mt-1 flex h-9 w-full rounded-lg border border-input bg-muted/50 px-3 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				/>
			</div>
			<div class="w-20">
				<label class="text-xs font-medium text-muted-foreground" for="api-key-expiry">Expiry</label>
				<div class="mt-1 flex items-center gap-1.5">
					<input
						id="api-key-expiry"
						type="number"
						bind:value={newKeyExpiry}
						placeholder="Days"
						min="1"
						class="flex h-9 w-full rounded-lg border border-input bg-muted/50 px-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					/>
				</div>
			</div>
			<div class="flex h-9 items-center text-xs text-muted-foreground">days <span class="ml-1 italic">(blank = never)</span></div>
			<Button size="sm" onclick={handleGenerate} disabled={generating || !newKeyName.trim()}>
				{#if generating}
					<Loader2 size={14} class="mr-1.5 animate-spin" />
					Generating...
				{:else}
					<KeyRound size={14} class="mr-1.5" />
					Generate Key
				{/if}
			</Button>
		</div>
	</div>
</div>

<ConfirmModal
	open={confirmRevokeOpen}
	title="Revoke API Key"
	message={`Are you sure you want to revoke "${revokeTarget?.name}"? This action cannot be undone and any applications using this key will lose access.`}
	confirmLabel="Revoke"
	variant="destructive"
	onconfirm={confirmRevoke}
	oncancel={() => { confirmRevokeOpen = false; revokeTarget = null; }}
/>
