<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { api } from '$lib/api/client';
	import { Button } from '$lib/components/ui/button';
	import { portal } from '$lib/utils/portal';
	import { X, Loader2 } from 'lucide-svelte';
	import {
		modals,
		type ModalSize,
		type ModalFormField,
		type ComponentModalOptions,
		type FormModalOptions,
	} from '$lib/stores/modals.svelte';

	const SIZE_CLASS: Record<ModalSize, string> = {
		sm: 'max-w-md',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-4xl',
	};

	const current = $derived(modals.current);
	const options = $derived(current?.options ?? null);
	const sizeClass = $derived(SIZE_CLASS[options?.size ?? 'md']);

	// ── Form modal state ─────────────────────────────────────────────
	// Keyed by modal id so switching to a queued modal starts fresh.
	let formValues = $state<Record<string, unknown>>({});
	let formModalId = $state<number | null>(null);

	const formOptions = $derived(
		options?.kind === 'form' || options?.kind === undefined ? (options as FormModalOptions) : null,
	);

	$effect(() => {
		if (!current || !formOptions) {
			formModalId = null;
			return;
		}
		if (formModalId !== current.id) {
			formModalId = current.id;
			const seed: Record<string, unknown> = {};
			for (const f of formOptions.fields) {
				seed[f.name] = f.value ?? (f.type === 'toggle' ? false : '');
			}
			formValues = seed;
		}
	});

	const formValid = $derived(
		formOptions
			? formOptions.fields.every(
					(f) =>
						!f.required ||
						(f.type === 'toggle'
							? true
							: String(formValues[f.name] ?? '').trim().length > 0),
				)
			: true,
	);

	function submitForm() {
		if (!formValid) return;
		modals.resolve({ ...formValues });
	}

	// ── Component modal state ────────────────────────────────────────
	const componentOptions = $derived(
		options?.kind === 'component' ? (options as ComponentModalOptions) : null,
	);
	let componentContainer = $state<HTMLDivElement | null>(null);
	let componentLoading = $state(false);
	let mountedModalId: number | null = null;

	const loadingPromises: Record<string, Promise<void> | undefined> = ((
		window as unknown as { __GRAV_MODAL_LOADING?: Record<string, Promise<void> | undefined> }
	).__GRAV_MODAL_LOADING ??= {});

	function tagName(o: ComponentModalOptions): string {
		return `grav-${o.plugin}--modal-${o.component}`;
	}

	function scriptPath(o: ComponentModalOptions): string {
		return `/gpm/plugins/${o.plugin}/modal-script/${o.component}`;
	}

	$effect(() => {
		// Mount the plugin component once per component-modal instance.
		if (!current || !componentOptions) {
			mountedModalId = null;
			return;
		}
		if (mountedModalId === current.id) return;
		const id = current.id;
		const o = componentOptions;
		// Wait for the {#if} container to exist, then load + mount.
		requestAnimationFrame(() => {
			if (modals.current?.id !== id) return;
			mountedModalId = id;
			void loadAndMount(o, id);
		});
	});

	async function loadAndMount(o: ComponentModalOptions, id: number) {
		const tag = tagName(o);
		componentLoading = true;
		try {
			if (!customElements.get(tag)) {
				if (!loadingPromises[tag]) {
					loadingPromises[tag] = (async () => {
						const code = await api.fetchScript(scriptPath(o));
						syncGlobals();
						const blob = new Blob(
							[`window.__GRAV_MODAL_TAG = ${JSON.stringify(tag)};\n${code}`],
							{ type: 'application/javascript' },
						);
						const blobUrl = URL.createObjectURL(blob);
						await import(/* @vite-ignore */ blobUrl);
						URL.revokeObjectURL(blobUrl);
						await customElements.whenDefined(tag);
					})();
				}
				await loadingPromises[tag];
			}
			// The modal may have been closed/replaced while loading.
			if (modals.current?.id !== id) return;
			mount(o, tag);
		} catch (err) {
			console.error(`[PluginModal] Failed to load ${tagName(o)}:`, err);
			loadingPromises[tag] = undefined;
		} finally {
			if (modals.current?.id === id) componentLoading = false;
		}
	}

	function mount(o: ComponentModalOptions, tag: string) {
		const container = componentContainer;
		if (!container) return;
		syncGlobals();
		container.innerHTML = '';
		const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
		if (o.props) {
			for (const [k, v] of Object.entries(o.props)) el[k] = v;
		}
		// Contract: component dispatches `resolve` (detail = result) or
		// `cancel`/`close` to dismiss. Mirrors the floating-widget `close` idiom.
		el.addEventListener('resolve', (e: Event) => modals.resolve((e as CustomEvent).detail));
		el.addEventListener('cancel', () => modals.cancel());
		el.addEventListener('close', () => modals.cancel());
		container.appendChild(el);
	}

	function syncGlobals() {
		window.__GRAV_API_SERVER_URL = auth.serverUrl;
		window.__GRAV_API_PREFIX = auth.apiPrefix || '/api/v1';
		window.__GRAV_API_TOKEN = auth.accessToken;
	}

	// ── Shared dismissal ─────────────────────────────────────────────
	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) modals.cancel();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') modals.cancel();
	}

	const showHeader = $derived(
		options?.kind === 'component' ? (componentOptions?.useStandardHeader ?? true) : true,
	);
</script>

<svelte:window onkeydown={current ? handleKeydown : undefined} />

{#if current && options}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		use:portal
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm sm:p-8"
		onclick={handleBackdrop}
	>
		<div class="flex max-h-[90vh] w-full {sizeClass} flex-col rounded-xl border border-border bg-card shadow-2xl">
			{#if showHeader}
				<div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
					<h2 class="text-base font-semibold text-foreground">
						{options.title ?? i18n.t('ADMIN_NEXT.ARE_YOU_SURE')}
					</h2>
					<button
						type="button"
						class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						title={i18n.t('ADMIN_NEXT.CANCEL')}
						onclick={() => modals.cancel()}
					>
						<X size={16} />
					</button>
				</div>
			{/if}

			{#if componentOptions}
				<!-- Plugin web component mounts here -->
				<div class="relative flex-1 overflow-auto">
					{#if componentLoading}
						<div class="absolute inset-0 flex items-center justify-center text-muted-foreground">
							<Loader2 size={20} class="animate-spin" />
						</div>
					{/if}
					<div bind:this={componentContainer} class="h-full"></div>
				</div>
			{:else if formOptions}
				<!-- Inline-field form -->
				<div class="flex-1 space-y-5 overflow-y-auto px-6 py-5">
					{#if formOptions.description}
						<p class="text-sm text-muted-foreground">{formOptions.description}</p>
					{/if}
					{#each formOptions.fields as field (field.name)}
						{@render formField(field)}
					{/each}
				</div>
				<div class="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
					<Button variant="outline" size="sm" onclick={() => modals.cancel()}>
						{formOptions.cancelLabel ?? i18n.t('ADMIN_NEXT.CANCEL')}
					</Button>
					<Button size="sm" disabled={!formValid} onclick={submitForm}>
						{formOptions.submitLabel ?? i18n.t('ADMIN_NEXT.CONFIRM')}
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#snippet formField(field: ModalFormField)}
	<div>
		{#if field.label}
			<label for="modal-field-{field.name}" class="block text-xs font-medium text-muted-foreground">
				{field.label}
				{#if field.required}<span class="text-destructive">*</span>{/if}
			</label>
		{/if}
		{#if field.type === 'textarea'}
			<textarea
				id="modal-field-{field.name}"
				value={String(formValues[field.name] ?? '')}
				placeholder={field.placeholder}
				oninput={(e) => (formValues[field.name] = (e.target as HTMLTextAreaElement).value)}
				class="mt-1 min-h-24 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			></textarea>
		{:else if field.type === 'select'}
			<select
				id="modal-field-{field.name}"
				value={String(formValues[field.name] ?? '')}
				onchange={(e) => (formValues[field.name] = (e.target as HTMLSelectElement).value)}
				class="mt-1 h-10 w-full rounded-lg border border-input bg-muted/50 px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
			>
				{#each field.options ?? [] as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		{:else if field.type === 'toggle'}
			<label class="mt-1 inline-flex cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					checked={Boolean(formValues[field.name])}
					onchange={(e) => (formValues[field.name] = (e.target as HTMLInputElement).checked)}
					class="h-4 w-4 rounded border-input text-primary focus:ring-1 focus:ring-ring"
				/>
				{#if field.placeholder}<span class="text-sm text-foreground">{field.placeholder}</span>{/if}
			</label>
		{:else}
			<input
				id="modal-field-{field.name}"
				type={field.type === 'number' ? 'number' : 'text'}
				value={String(formValues[field.name] ?? '')}
				placeholder={field.placeholder}
				oninput={(e) =>
					(formValues[field.name] =
						field.type === 'number'
							? (e.target as HTMLInputElement).valueAsNumber
							: (e.target as HTMLInputElement).value)}
				class="mt-1 h-10 w-full rounded-lg border border-input bg-muted/50 px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			/>
		{/if}
		{#if field.help}
			<p class="mt-1 text-xs text-muted-foreground">{field.help}</p>
		{/if}
	</div>
{/snippet}
