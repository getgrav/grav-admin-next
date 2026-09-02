<script lang="ts">
	/**
	 * A plugin's (or theme's) own settings form, ready to be dropped into
	 * somebody else's page.
	 *
	 * This is what the `grav-blueprint-form` custom element mounts. A plugin
	 * that ships a component-mode admin page can put its settings on one of its
	 * own screens instead of sending people out to /plugins/<slug>, and it gets
	 * the real thing — the same blueprint, the same fields, the same validation,
	 * the same save endpoint and the same per-field revert as the admin's own
	 * settings page.
	 *
	 * Everything the host page needs to react to is reported through `onevent`,
	 * which the custom element turns into DOM events.
	 */
	import { setContext } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { provideFormCommit } from '$lib/utils/form-commit.svelte';
	import { provideConfigOverrides } from '$lib/utils/config-overrides.svelte';
	import { getPluginBlueprint, getThemeBlueprint } from '$lib/api/endpoints/blueprints';
	import type { BlueprintSchema } from '$lib/api/endpoints/blueprints';
	import {
		getPluginConfig, savePluginConfig, getThemeConfig, saveThemeConfig,
	} from '$lib/api/endpoints/gpm';
	import BlueprintForm from './BlueprintForm.svelte';
	import { checkRequiredOrToast, scrollToFirstError, validateFieldAt, stableJson } from '$lib/utils/blueprint-validation';
	import { canWrite } from '$lib/utils/permissions';
	import { Button } from '$lib/components/ui/button';
	import UnsavedIndicator from '$lib/components/ui/UnsavedIndicator.svelte';
	import { toast } from 'svelte-sonner';
	import { Save, Loader2 } from 'lucide-svelte';

	const REDACTED = '********';

	interface Props {
		/** Which kind of package this form is for. */
		kind?: 'plugins' | 'themes';
		/** The plugin or theme slug. */
		slug?: string;
		/** Hide every field that does not match this text. Live. */
		filter?: string;
		/** Set to hide the built-in Save row when the host draws its own. */
		hideToolbar?: boolean;
		/** Reported back to the custom element, which re-fires each one as a DOM event. */
		onevent?: (name: string, detail: Record<string, unknown>) => void;
	}

	let {
		kind = 'plugins', slug = '', filter = '', hideToolbar = false, onevent,
	}: Props = $props();

	let blueprint = $state<BlueprintSchema | null>(null);
	let configData = $state<Record<string, unknown>>({});
	let validationErrors = $state<Record<string, string>>({});
	let originalJson = $state('{}');
	let etag = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	const canSave = $derived(canWrite('config'));
	const hasChanges = $derived(stableJson(configData) !== originalJson);

	// Scope for blueprint-upload destination resolution (`self@:` → the package
	// directory), the same value the /plugins/<slug> page sets.
	setContext('blueprintScope', () => (slug ? `${kind}/${slug}` : ''));
	// Bus for leaf fields that defer side effects to the save commit.
	const formCommit = provideFormCommit();

	function say(name: string, detail: Record<string, unknown> = {}) {
		onevent?.(name, { kind, slug, ...detail });
	}

	// Tell the host every time the form crosses from clean to dirty or back, so
	// it can light up its own Save button or put up its own leave guard.
	let lastDirty = $state(false);
	$effect(() => {
		const now = hasChanges;
		if (now === lastDirty) return;
		lastDirty = now;
		say('dirty', { dirty: now });
	});

	async function load(target: { kind: 'plugins' | 'themes'; slug: string }) {
		const { kind, slug } = target;
		loading = true;
		error = '';
		blueprint = null;
		if (!slug) {
			loading = false;
			error = 'No plugin or theme was named.';
			say('error', { message: error });
			return;
		}

		try {
			const [bp, cfg] = await Promise.all([
				kind === 'themes' ? getThemeBlueprint(slug) : getPluginBlueprint(slug),
				kind === 'themes' ? getThemeConfig(slug) : getPluginConfig(slug),
			]);
			blueprint = bp;
			configData = cfg.data;
			originalJson = stableJson(cfg.data);
			etag = cfg.etag;
			ovr.ingest({ overrides: cfg.overrides, fallback: cfg.fallback });
			say('ready', { fields: bp?.fields?.length ?? 0 });
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'The settings could not be loaded.';
			say('error', { message: error });
		} finally {
			loading = false;
		}
	}

	function handleChange(path: string, value: unknown) {
		const parts = path.split('.');
		const newData = { ...configData };
		let current: Record<string, unknown> = newData;

		for (let i = 0; i < parts.length - 1; i++) {
			const key = parts[i];
			if (typeof current[key] !== 'object' || current[key] === null) {
				current[key] = {};
			} else {
				current[key] = { ...(current[key] as Record<string, unknown>) };
			}
			current = current[key] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
		configData = newData;

		// Re-check this field now it has been touched: flag it if a required
		// field was cleared, clear the flag once it is filled again.
		const err = blueprint ? validateFieldAt(blueprint.fields, path, newData) : null;
		if (err) {
			validationErrors = { ...validationErrors, [path]: err };
		} else if (validationErrors[path]) {
			const rest = { ...validationErrors };
			delete rest[path];
			validationErrors = rest;
		}
	}

	function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
		const parts = path.split('.');
		let cur: Record<string, unknown> = obj;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
			cur = cur[parts[i]] as Record<string, unknown>;
		}
		cur[parts[parts.length - 1]] = value;
	}

	// Per-field override indicators and revert, exactly as the settings page
	// wires them.
	const ovr = provideConfigOverrides({
		scope: () => `${kind}/${slug}`,
		canWrite: () => canSave,
		etag: () => etag,
		applyFieldRevert: (path, value, newEtag) => {
			handleChange(path, value);
			const orig = JSON.parse(originalJson);
			setPath(orig, path, value);
			originalJson = stableJson(orig);
			etag = newEtag;
		},
		applyReset: (data, newEtag) => {
			configData = data;
			originalJson = stableJson(data);
			etag = newEtag;
		},
	});

	/** Drop the redaction sentinel so saving never writes it over a real secret. */
	function stripRedacted(obj: unknown): unknown {
		if (typeof obj === 'string') return obj === REDACTED ? undefined : obj;
		if (Array.isArray(obj)) return obj.map(stripRedacted);
		if (obj && typeof obj === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				const stripped = stripRedacted(value);
				if (stripped !== undefined) result[key] = stripped;
			}
			return result;
		}
		return obj;
	}

	export async function save(): Promise<boolean> {
		if (!blueprint || saving || !canSave) return false;

		validationErrors = checkRequiredOrToast(blueprint.fields, configData);
		if (Object.keys(validationErrors).length > 0) {
			scrollToFirstError();
			say('error', { message: i18n.t('ADMIN_NEXT.PLUGINS.FAILED_TO_SAVE_CONFIGURATION') });
			return false;
		}

		saving = true;
		try {
			const cleaned = stripRedacted(configData) as Record<string, unknown>;
			if (kind === 'themes') {
				await saveThemeConfig(slug, cleaned, etag);
			} else {
				await savePluginConfig(slug, cleaned, etag);
			}

			const fresh = kind === 'themes' ? await getThemeConfig(slug) : await getPluginConfig(slug);
			configData = fresh.data;
			originalJson = stableJson(fresh.data);
			etag = fresh.etag;
			ovr.ingest({ overrides: fresh.overrides, fallback: fresh.fallback });

			await formCommit.emit();

			toast.success(i18n.t('ADMIN_NEXT.TOASTS.CONFIG_SAVED', { name: slug }));
			say('saved', {});
			return true;
		} catch (err: unknown) {
			const status = err && typeof err === 'object' && 'status' in err
				? (err as { status: number }).status : 0;
			const message = status === 409
				? i18n.t('ADMIN_NEXT.PLUGINS.CONFIGURATION_WAS_MODIFIED_ELSEWHERE')
				: i18n.t('ADMIN_NEXT.PLUGINS.FAILED_TO_SAVE_CONFIGURATION');
			toast.error(message);
			say('error', { message });
			return false;
		} finally {
			saving = false;
		}
	}

	export async function reload(): Promise<void> {
		await load({ kind, slug });
	}

	export function isDirty(): boolean {
		return hasChanges;
	}

	// Reload whenever the host points the element at a different package.
	$effect(() => {
		load({ kind, slug });
	});
</script>

{#if !hideToolbar && blueprint}
	<div class="mb-4 flex items-center justify-end gap-2">
		<UnsavedIndicator hasChanges={hasChanges} saving={saving} lastSavedAt={null} autoSaveEnabled={false} />
		<Button size="sm" onclick={save} disabled={!hasChanges || saving || !canSave}>
			{#if saving}
				<Loader2 size={14} class="me-1.5 animate-spin" />
			{:else}
				<Save size={14} class="me-1.5" />
			{/if}
			Save
		</Button>
	</div>
{/if}

{#if loading}
	<div class="py-12 text-center text-sm text-muted-foreground">
		{i18n.t('ADMIN_NEXT.CONFIG.LOADING_CONFIGURATION')}
	</div>
{:else if error}
	<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
		{error}
	</div>
{:else if blueprint}
	<BlueprintForm
		fields={blueprint.fields}
		data={configData}
		onchange={handleChange}
		errors={validationErrors}
		{filter}
	/>
{:else}
	<div class="rounded-xl border border-dashed border-border p-8 text-center">
		<p class="text-sm text-muted-foreground">
			{i18n.t('ADMIN_NEXT.PLUGINS.NO_CONFIGURATION_OPTIONS_AVAILABLE_FOR')}
		</p>
	</div>
{/if}
