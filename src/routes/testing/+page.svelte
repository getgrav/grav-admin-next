<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { i18n } from '$lib/stores/i18n.svelte';
	import {
		Bell, Check, AlertTriangle, Info, X, Loader2,
		Plus, Trash2, Edit, Copy, Search, Settings,
		ChevronDown, ExternalLink, Heart
	} from 'lucide-svelte';

	// Form test state
	let textValue = $state('');
	let selectValue = $state('');
	let switchValue = $state(false);
	let checkboxValue = $state(false);
	let textareaValue = $state('');
	let rangeValue = $state(50);
</script>

<svelte:head>
	<title>Testing — Grav Admin</title>
</svelte:head>

<div class="space-y-8 p-5">
	<div>
		<h1 class="text-xl font-semibold tracking-tight text-foreground">UI Testing</h1>
		<p class="mt-0.5 text-[13px] text-muted-foreground">Component playground and testing area</p>
	</div>

	<!-- ============================================ -->
	<!-- Toast Notifications -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Toast Notifications</h2>
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onclick={() => toast.success('Changes saved successfully')}>
					<Check size={14} /> Success
				</Button>
				<Button variant="outline" size="sm" onclick={() => toast.error('Something went wrong. Please try again.')}>
					<X size={14} /> Error
				</Button>
				<Button variant="outline" size="sm" onclick={() => toast.warning('Your session will expire in 5 minutes')}>
					<AlertTriangle size={14} /> Warning
				</Button>
				<Button variant="outline" size="sm" onclick={() => toast.info('A new version of Grav is available')}>
					<Info size={14} /> Info
				</Button>
				<Button variant="outline" size="sm" onclick={() => toast('Plain message without icon')}>
					Default
				</Button>
				<Button variant="outline" size="sm" onclick={() => {
					toast.success('First toast');
					setTimeout(() => toast.error('Second toast'), 200);
					setTimeout(() => toast.info('Third toast'), 400);
					setTimeout(() => toast.warning('Fourth toast'), 600);
				}}>
					Stack 4
				</Button>
				<Button variant="outline" size="sm" onclick={() => {
					toast.loading('Saving changes...');
					setTimeout(() => toast.success('Changes saved!'), 2000);
				}}>
					<Loader2 size={14} /> Loading → Success
				</Button>
				<Button variant="outline" size="sm" onclick={() => {
					toast('Action completed', {
						description: 'The page has been published and is now live.',
						action: { label: 'Undo', onClick: () => toast.info('Undone!') },
					});
				}}>
					With Action
				</Button>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- Buttons -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Buttons</h2>
		<div class="rounded-lg border border-border bg-card p-4 space-y-4">
			<div>
				<p class="mb-2 text-xs text-muted-foreground">Variants</p>
				<div class="flex flex-wrap gap-2">
					<Button>Default</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="destructive">Destructive</Button>
					<Button variant="outline">Outline</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="link">Link</Button>
				</div>
			</div>
			<div>
				<p class="mb-2 text-xs text-muted-foreground">Sizes</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button size="lg">Large</Button>
					<Button>Default</Button>
					<Button size="sm">Small</Button>
					<Button size="icon"><Plus size={16} /></Button>
				</div>
			</div>
			<div>
				<p class="mb-2 text-xs text-muted-foreground">With Icons</p>
				<div class="flex flex-wrap gap-2">
					<Button><Plus size={15} /> Add Page</Button>
					<Button variant="destructive"><Trash2 size={15} /> Delete</Button>
					<Button variant="outline"><Edit size={15} /> Edit</Button>
					<Button variant="outline"><Copy size={15} /> Duplicate</Button>
					<Button variant="secondary"><Settings size={15} /> Settings</Button>
					<Button disabled><Loader2 size={15} class="animate-spin" /> Saving...</Button>
				</div>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- Badges -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Badges</h2>
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex flex-wrap gap-2">
				<Badge>Default</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="success">Published</Badge>
				<Badge variant="destructive">Error</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="outline">default</Badge>
				<Badge variant="outline">blog</Badge>
				<Badge variant="outline">post</Badge>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- Form Elements -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Form Elements</h2>
		<div class="rounded-lg border border-border bg-card p-4 space-y-4">
			<div class="grid gap-4 lg:grid-cols-2">
				<!-- Text Input -->
				<div class="space-y-1.5">
					<label for="test-text" class="text-[13px] font-medium text-foreground">Text Input</label>
					<input id="test-text" type="text" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" bind:value={textValue} />
					<p class="text-xs text-muted-foreground">Helper text goes here</p>
				</div>

				<!-- Select -->
				<div class="space-y-1.5">
					<label for="test-select" class="text-[13px] font-medium text-foreground">Select</label>
					<select id="test-select" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" bind:value={selectValue}>
						<option value="">Select an option...</option>
						<option value="default">Default</option>
						<option value="blog">Blog</option>
						<option value="item">Item</option>
					</select>
				</div>

				<!-- Disabled Input -->
				<div class="space-y-1.5">
					<label class="text-[13px] font-medium text-foreground">Disabled Input</label>
					<input type="text" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value="Can't edit this" disabled />
				</div>

				<!-- Error Input -->
				<div class="space-y-1.5">
					<label class="text-[13px] font-medium text-foreground">Error State</label>
					<input type="text" class="flex h-9 w-full rounded-md border border-red-500 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors ring-1 ring-red-500/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500" value="Invalid value" />
					<p class="text-xs text-red-500">This field has an error</p>
				</div>
			</div>

			<!-- Textarea -->
			<div class="space-y-1.5">
				<label for="test-textarea" class="text-[13px] font-medium text-foreground">Textarea</label>
				<textarea id="test-textarea" class="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" rows={3} bind:value={textareaValue} style="resize: vertical;"></textarea>
			</div>

			<!-- Toggles & Checks -->
			<div class="grid gap-4 lg:grid-cols-3">
				<div class="space-y-3">
					<p class="text-xs font-medium text-muted-foreground">Switches</p>
					<label class="flex cursor-pointer items-center justify-between">
						<span class="text-sm text-foreground">Published</span>
						<input type="checkbox" class="switch" bind:checked={switchValue} />
					</label>
					<label class="flex cursor-pointer items-center justify-between">
						<span class="text-sm text-foreground">Visible in nav</span>
						<input type="checkbox" class="switch" checked />
					</label>
					<label class="flex cursor-pointer items-center justify-between">
						<span class="text-sm text-muted-foreground">Disabled</span>
						<input type="checkbox" class="switch" disabled />
					</label>
				</div>

				<div class="space-y-3">
					<p class="text-xs font-medium text-muted-foreground">Checkboxes</p>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="checkbox" class="checkbox" bind:checked={checkboxValue} />
						<span class="text-sm text-foreground">Option A</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="checkbox" class="checkbox" checked />
						<span class="text-sm text-foreground">Option B</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="checkbox" class="checkbox" disabled />
						<span class="text-sm text-muted-foreground">Disabled</span>
					</label>
				</div>

				<div class="space-y-3">
					<p class="text-xs font-medium text-muted-foreground">Radio Buttons</p>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="radio" class="radio" name="test-radio" value="a" checked />
						<span class="text-sm text-foreground">Option A</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="radio" class="radio" name="test-radio" value="b" />
						<span class="text-sm text-foreground">Option B</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="radio" class="radio" name="test-radio" value="c" disabled />
						<span class="text-sm text-muted-foreground">Disabled</span>
					</label>
				</div>
			</div>

			<!-- Range -->
			<div class="space-y-1.5">
				<label class="text-[13px] font-medium text-foreground">Range: {rangeValue}%</label>
				<input type="range" min="0" max="100" bind:value={rangeValue} class="w-full accent-[hsl(var(--ring))]" />
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- Cards -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Cards</h2>
		<div class="grid gap-4 lg:grid-cols-3">
			<div class="rounded-lg border border-border bg-card p-4">
				<h3 class="text-sm font-semibold text-foreground">Basic Card</h3>
				<p class="mt-1 text-[13px] text-muted-foreground">A simple card with title and description content.</p>
			</div>
			<div class="rounded-lg border border-border bg-card p-4">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-semibold text-foreground">With Actions</h3>
					<Button variant="ghost" size="icon"><Settings size={14} /></Button>
				</div>
				<p class="mt-1 text-[13px] text-muted-foreground">Card with header action button.</p>
				<div class="mt-3 flex gap-2">
					<Button variant="outline" size="sm">Cancel</Button>
					<Button size="sm">Save</Button>
				</div>
			</div>
			<div class="rounded-lg border border-border bg-card overflow-hidden">
				<div class="border-b border-border bg-muted/50 px-4 py-2">
					<h3 class="text-sm font-semibold text-foreground">With Header</h3>
				</div>
				<div class="p-4">
					<p class="text-[13px] text-muted-foreground">Card with a distinct header section.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- Alerts -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Inline Alerts</h2>
		<div class="space-y-2">
			<div class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
				<Check size={16} /> Page saved successfully
			</div>
			<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300">
				<X size={16} /> Failed to save page. Please check your connection.
			</div>
			<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
				<AlertTriangle size={16} /> Your session will expire in 5 minutes
			</div>
			<div class="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300">
				<Info size={16} /> A new version of Grav is available
			</div>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- Typography -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Typography</h2>
		<div class="rounded-lg border border-border bg-card p-4 space-y-2">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">Heading 1</h1>
			<h2 class="text-xl font-semibold tracking-tight text-foreground">Heading 2</h2>
			<h3 class="text-lg font-semibold text-foreground">Heading 3</h3>
			<h4 class="text-sm font-semibold text-foreground">Heading 4</h4>
			<p class="text-sm text-foreground">Body text — The quick brown fox jumps over the lazy dog.</p>
			<p class="text-sm text-muted-foreground">Muted text — Secondary information and descriptions.</p>
			<p class="text-xs text-muted-foreground">Small text — Timestamps, helper text, metadata.</p>
			<p class="font-mono text-xs text-muted-foreground">/routes/pages/edit/[...route]/+page.svelte</p>
		</div>
	</section>

	<!-- ============================================ -->
	<!-- i18n -->
	<!-- ============================================ -->
	<section class="space-y-3">
		<h2 class="text-sm font-semibold text-foreground">Translation (i18n)</h2>
		<div class="rounded-lg border border-border bg-card p-4">
			<dl class="space-y-1.5 text-[13px]">
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Language</dt>
					<dd class="font-medium text-foreground">{i18n.lang}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">Strings loaded</dt>
					<dd class="font-medium text-foreground">{i18n.count}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">t('PLUGIN_ADMIN.TITLE')</dt>
					<dd class="font-medium text-foreground">{i18n.t('PLUGIN_ADMIN.TITLE')}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">t('PLUGIN_ADMIN.CONTENT')</dt>
					<dd class="font-medium text-foreground">{i18n.t('PLUGIN_ADMIN.CONTENT')}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">t('PLUGIN_ADMIN.SAVE')</dt>
					<dd class="font-medium text-foreground">{i18n.t('PLUGIN_ADMIN.SAVE')}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">tMaybe('Plain Text')</dt>
					<dd class="font-medium text-foreground">{i18n.tMaybe('Plain Text')}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-muted-foreground">tMaybe('UNKNOWN.KEY')</dt>
					<dd class="font-medium text-foreground">{i18n.tMaybe('UNKNOWN.KEY')}</dd>
				</div>
			</dl>
		</div>
	</section>
</div>
