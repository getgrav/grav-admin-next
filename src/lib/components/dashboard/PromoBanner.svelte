<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	import { X } from 'lucide-svelte';
	import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
	import { dismissNotification } from '$lib/api/endpoints/dashboard-widgets';
	import { renderInlineMarkdown } from '$lib/dashboard/format';
	import type { Notification } from '$lib/api/endpoints/dashboard';

	// The full-width carousel under the stats row, fed by the getgrav.org
	// feed's `dashboard-banner` location. Slides move one way: after the last
	// one, a copy of the first slides in and the track snaps back to the real
	// first slide, so the loop never rewinds across every slide.

	let { slides = [] }: { slides?: Notification[] } = $props();

	const ROTATE_MS = 9000;
	const SLIDE_MS = 600;

	let closed = $state(false);
	// Position on the track. `count` is the copy of the first slide.
	let pos = $state(0);
	let animate = $state(true);
	let paused = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	// Shuffled once per load, so every promo gets its turn up front instead of
	// the feed's first slide always leading. Kept until the set of slides
	// changes, so a re-render doesn't reorder them mid-rotation.
	let shuffled: { key: string; list: Notification[] } = { key: '', list: [] };
	const ordered = $derived.by(() => {
		const key = slides.map((s) => s.id).join('\n');
		if (key !== shuffled.key) {
			const list = [...slides];
			for (let i = list.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[list[i], list[j]] = [list[j], list[i]];
			}
			shuffled = { key, list };
		}
		return shuffled.list;
	});

	const count = $derived(ordered.length);
	const track = $derived(count > 1 ? [...ordered, ordered[0]] : ordered);
	const active = $derived(count ? pos % count : 0);

	// The track runs the other way in a right-to-left admin.
	const dirSign =
		typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 1 : -1;

	const reduceMotion =
		typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

	// Each accent is a gradient with a pattern of its own on top. The feed
	// picks the accent, and `pattern` when a slide wants a different one.
	const ACCENTS: Record<string, { gradient: string; pattern: string }> = {
		teal: { gradient: '#0f766e 0%, #0d9488 32%, #0e7490 68%, #083344 100%', pattern: 'waves' },
		purple: { gradient: '#6d28d9 0%, #9333ea 34%, #7e22ce 62%, #2e1065 100%', pattern: 'sparkle' },
		blue: { gradient: '#1e40af 0%, #2450e0 34%, #1d4ed8 62%, #0b1a4a 100%', pattern: 'rings' },
		amber: { gradient: '#b45309 0%, #ea580c 34%, #c2410c 62%, #431407 100%', pattern: 'dots' },
		rose: { gradient: '#be123c 0%, #e11d48 34%, #db2777 62%, #500724 100%', pattern: 'dots' },
	};

	const svg = (body: string, w: number, h: number) =>
		`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;
	const star = (x: number, y: number, r: number) =>
		`<path d='M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z'/>`;
	const rings = Array.from({ length: 22 }, (_, i) => `<circle cx='1240' cy='60' r='${30 + i * 36}'/>`).join('');

	// Tiled ones repeat; `rings` is one drawing anchored at the far end.
	// Opacity is per pattern: thin lines need more of it than the waves do.
	const PATTERN_OPACITY: Record<string, number> = { waves: 0.11, sparkle: 0.3, rings: 0.2, dots: 0.18 };
	const PATTERNS: Record<string, string> = {
		waves: `background-image: ${svg("<path d='M0 12Q12 0 24 12T48 12T72 12T96 12' fill='none' stroke='#fff' stroke-width='1.6'/>", 96, 24)}; background-size: 96px 24px`,
		sparkle: `background-image: ${svg(`<g fill='#fff'>${star(22, 24, 9)}${star(88, 62, 6)}${star(124, 18, 4)}${star(50, 84, 3.5)}<circle cx='104' cy='98' r='1.8'/><circle cx='10' cy='72' r='1.4'/><circle cx='66' cy='30' r='1.4'/></g>`, 140, 110)}; background-size: 140px 110px`,
		rings: `background-image: ${svg(`<g fill='none' stroke='#fff' stroke-width='1.5'>${rings}</g>`, 1200, 120)}; background-size: auto 100%; background-repeat: no-repeat; background-position: right center`,
		dots: `background-image: ${svg("<circle cx='2' cy='2' r='1.4' fill='#fff'/>", 16, 16)}; background-size: 16px 16px`,
	};

	function accentOf(slide: Notification) {
		return ACCENTS[slide.accent ?? ''] ?? ACCENTS.purple;
	}

	function backgroundStyle(slide: Notification): string {
		const angle = dirSign < 0 ? 110 : 250;
		return `background: radial-gradient(120% 140% at 0% 0%, rgba(255,255,255,0.16), transparent 45%), linear-gradient(${angle}deg, ${accentOf(slide).gradient})`;
	}

	// The pattern fades in toward the button end, so the text sits on the plain gradient.
	function patternStyle(slide: Notification): string {
		const name = PATTERNS[slide.pattern ?? ''] ? slide.pattern! : accentOf(slide).pattern;
		const toward = dirSign < 0 ? 'to right' : 'to left';
		const mask = `linear-gradient(${toward}, transparent 20%, #000 80%)`;
		return `${PATTERNS[name]}; opacity: ${PATTERN_OPACITY[name]}; -webkit-mask-image: ${mask}; mask-image: ${mask}`;
	}

	function go(to: number) {
		if (count < 2) return;
		animate = !reduceMotion;
		pos = to;
		if (reduceMotion && pos >= count) pos = 0;
	}

	function next() {
		go(pos + 1);
	}

	function prev() {
		if (count < 2) return;
		if (pos === 0) {
			// Jump to the copy of the first slide without moving, then slide back.
			animate = false;
			pos = count;
			requestAnimationFrame(() => requestAnimationFrame(() => go(count - 1)));
			return;
		}
		go(pos - 1);
	}

	function onTransitionEnd(e: TransitionEvent) {
		if (e.target !== e.currentTarget || pos < count) return;
		animate = false;
		pos = 0;
	}

	// Autoplay restarts after every move, so a click never gets cut short.
	$effect(() => {
		void pos;
		if (timer) clearTimeout(timer);
		timer = null;
		if (!closed && !paused && count > 1) timer = setTimeout(next, ROTATE_MS);
		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	$effect(() => {
		if (pos > count) pos = 0;
	});

	$effect(() => {
		const onVisibility = () => (paused = document.hidden);
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	async function close() {
		closed = true;
		// Each slide is dismissed on its own id, and the feed's `reappear_after`
		// on each one decides when it comes back. One at a time: the API
		// rewrites a single per-user file on each call, so parallel calls
		// overwrite each other and only the last id sticks.
		for (const slide of slides) {
			try {
				await dismissNotification(slide.id);
			} catch {
				// The local hide still holds for this visit.
			}
		}
	}

	// The feed is getgrav.org's, but plugins can add slides too.
	function isWebUrl(url: string | undefined): boolean {
		return !!url && /^https?:\/\//i.test(url);
	}

	function imageHeight(slide: Notification): number {
		const h = Number(slide.image_height);
		return Number.isFinite(h) && h > 0 ? Math.min(48, Math.max(20, Math.round(h))) : 28;
	}
</script>

{#if !closed && count > 0}
	<section
		class="relative overflow-hidden rounded-lg text-white shadow-md"
		aria-roledescription="carousel"
		aria-label={i18n.t('ADMIN_NEXT.PROMO_BANNER.LABEL')}
		onmouseenter={() => (paused = true)}
		onmouseleave={() => (paused = false)}
		onfocusin={() => (paused = true)}
		onfocusout={() => (paused = false)}
	>
		<div
			class="flex"
			style="transform: translateX({dirSign * pos * 100}%); transition: {animate ? `transform ${SLIDE_MS}ms cubic-bezier(0.65, 0, 0.35, 1)` : 'none'}"
			ontransitionend={onTransitionEnd}
		>
			{#each track as slide, i (i)}
				<div
					class="relative w-full shrink-0 overflow-hidden"
					style={backgroundStyle(slide)}
					role="group"
					aria-roledescription="slide"
					aria-label={`${(i % count) + 1} / ${count}`}
					inert={i !== pos}
				>
					<div class="pointer-events-none absolute inset-0" style={patternStyle(slide)} aria-hidden="true"></div>
					<div class="relative flex flex-col gap-3 px-5 py-4 pe-12 md:flex-row md:items-center md:gap-6 md:pe-44">
						<div class="flex shrink-0 items-center">
							{#if slide.image}
								<img src={slide.image} alt={slide.title ?? ''} class="w-auto drop-shadow-sm" style="height: {imageHeight(slide)}px" />
							{:else if slide.title}
								<span class="text-base font-semibold">{slide.title}</span>
							{/if}
						</div>
						<p class="min-w-0 flex-1 text-[0.8125rem] leading-snug text-white/90 md:border-s md:border-white/20 md:ps-6 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-white [&_strong]:text-white">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html renderInlineMarkdown(slide.message)}
						</p>
						{#if slide.action && isWebUrl(slide.action.url)}
							<a
								href={slide.action.url}
								target="_blank"
								rel="noopener noreferrer"
								class="group/cta inline-flex shrink-0 items-center gap-1.5 self-start rounded-md bg-white px-3.5 py-1.5 text-[0.75rem] font-semibold text-gray-900 shadow-sm transition-colors hover:bg-white/90 md:self-auto"
							>
								{slide.action.label}
								<DirectionalIcon name="arrow-forward" size={13} class="transition-transform group-hover/cta:translate-x-0.5 rtl:group-hover/cta:-translate-x-0.5" />
							</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="absolute bottom-3.5 end-3 flex items-center gap-1 md:bottom-auto md:top-1/2 md:-translate-y-1/2">
			{#if count > 1}
				<button
					type="button"
					class="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
					onclick={prev}
					aria-label={i18n.t('ADMIN_NEXT.TOP_BANNER.PREVIOUS')}
				>
					<DirectionalIcon name="chevron-back" size={14} />
				</button>
				{#each ordered as slide, i (slide.id)}
					<button
						type="button"
						class="flex h-6 w-3.5 items-center justify-center"
						onclick={() => go(i)}
						aria-label={i18n.t('ADMIN_NEXT.PROMO_BANNER.SHOW_SLIDE', { n: i + 1 })}
						aria-current={i === active ? 'true' : undefined}
					>
						<span class="block h-1.5 rounded-full transition-all {i === active ? 'w-3.5 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/70'}"></span>
					</button>
				{/each}
				<button
					type="button"
					class="flex h-6 w-6 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
					onclick={next}
					aria-label={i18n.t('ADMIN_NEXT.PROMO_BANNER.NEXT')}
				>
					<DirectionalIcon name="chevron-forward" size={14} />
				</button>
				<span class="mx-1 h-4 w-px bg-white/25" aria-hidden="true"></span>
			{/if}
			<button
				type="button"
				class="flex h-7 w-7 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
				onclick={close}
				title={i18n.t('ADMIN_NEXT.DISMISS')}
				aria-label={i18n.t('ADMIN_NEXT.DISMISS')}
			>
				<X size={15} />
			</button>
		</div>
	</section>
{/if}
