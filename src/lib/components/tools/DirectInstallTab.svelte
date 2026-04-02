<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { directInstallUrl, directInstallFile } from '$lib/api/endpoints/tools';
	import { Button } from '$lib/components/ui/button';
	import { Upload, Link, Loader2, Package } from 'lucide-svelte';

	let url = $state('');
	let installing = $state(false);
	let dragOver = $state(false);

	async function handleUrlInstall() {
		if (!url.trim()) return;
		installing = true;
		try {
			await directInstallUrl(url.trim());
			toast.success('Package installed successfully');
			url = '';
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Installation failed');
		} finally {
			installing = false;
		}
	}

	async function handleFileInstall(file: File) {
		if (!file.name.endsWith('.zip')) {
			toast.error('Only .zip files are supported');
			return;
		}
		installing = true;
		try {
			await directInstallFile(file);
			toast.success('Package installed successfully');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Installation failed');
		} finally {
			installing = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) handleFileInstall(file);
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFileInstall(file);
		input.value = '';
	}
</script>

<div class="space-y-6">
	<!-- File Upload -->
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="mb-3 flex items-center gap-2">
			<Upload size={15} class="text-muted-foreground" />
			<h3 class="text-sm font-semibold text-foreground">Install from File</h3>
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<label
			class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition-colors
				{dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}"
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => { dragOver = false; }}
			ondrop={handleDrop}
		>
			{#if installing}
				<Loader2 size={32} class="mb-2 animate-spin text-muted-foreground" />
				<p class="text-sm text-muted-foreground">Installing...</p>
			{:else}
				<Package size={32} class="mb-2 text-muted-foreground/50" />
				<p class="text-sm font-medium text-foreground">Drop a .zip file here or click to browse</p>
				<p class="mt-1 text-xs text-muted-foreground">Supports Grav plugin and theme packages</p>
			{/if}
			<input type="file" accept=".zip" class="hidden" onchange={handleFileInput} disabled={installing} />
		</label>
	</div>

	<!-- URL Install -->
	<div class="rounded-lg border border-border bg-card p-4">
		<div class="mb-3 flex items-center gap-2">
			<Link size={15} class="text-muted-foreground" />
			<h3 class="text-sm font-semibold text-foreground">Install from URL</h3>
		</div>
		<div class="flex gap-2">
			<input
				type="url"
				class="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				placeholder="https://example.com/plugin-package.zip"
				bind:value={url}
				disabled={installing}
				onkeydown={(e) => { if (e.key === 'Enter') handleUrlInstall(); }}
			/>
			<Button size="sm" onclick={handleUrlInstall} disabled={installing || !url.trim()}>
				{#if installing}
					<Loader2 size={14} class="animate-spin" />
				{:else}
					Install
				{/if}
			</Button>
		</div>
	</div>
</div>
