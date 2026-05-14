# Right-to-left language support

Admin-next runs in both LTR and RTL. The active direction follows the user's `adminLanguage` preference: `LanguageCodes::isRtl($lang)` on the server decides whether the language is RTL, the `/translations/{lang}` response carries `dir: 'rtl' | 'ltr'`, and the client mirrors that onto `<html dir>` and into `window.__GRAV_I18N.dir`.

This doc covers the conventions for keeping things consistent.

## The contract

Anything that needs to know the current writing direction reads it from one of two places:

- **Inside Svelte components.** Use the `i18n` store:
  ```ts
  import { i18n } from '$lib/stores/i18n.svelte';
  $effect(() => {
      console.log(i18n.dir); // 'ltr' | 'rtl', reactive
  });
  ```
- **Outside the SPA (plugin web components, third-party JS).** Read `window.__GRAV_I18N.dir` and subscribe via `window.__GRAV_I18N.subscribe(fn)` to re-apply on live language switch — the user can change admin language without a hard reload.

The `dir` attribute is also on `<html>`, so anything that participates in normal CSS cascade gets it for free.

## Layout: prefer logical utilities

Tailwind v4 ships direction-aware logical utilities. They compile to `padding-inline-start`, `border-inline-end`, etc., so one rule handles both directions and the diff stays small:

| Physical (don't use)       | Logical (use)            |
|----------------------------|--------------------------|
| `ml-*` / `mr-*`            | `ms-*` / `me-*`          |
| `pl-*` / `pr-*`            | `ps-*` / `pe-*`          |
| `border-l` / `border-r`    | `border-s` / `border-e`  |
| `text-left` / `text-right` | `text-start` / `text-end`|
| `left-0` / `right-0`       | `start-0` / `end-0`      |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |

Inline styles get logical CSS properties: `inset-inline-start`, `padding-inline-end`, `border-inline-start-color`, etc.

A codemod is committed at [`scripts/rtl-pairs.mjs`](../scripts/rtl-pairs.mjs); re-run it on a fresh component bundle to mechanically rewrite the simple cases.

## When the `rtl:` pair pattern is the right tool

Logical utilities cover ~90% of cases. The exceptions:

- **CSS transforms.** There's no logical equivalent for `-translate-x-full`. Pair physical with `rtl:` instead: `-translate-x-full rtl:translate-x-full`. If it interacts with breakpoints (`lg:translate-x-0`), scope the slide with `max-lg:` so the `[dir="rtl"]` attribute-selector specificity doesn't outrank the media-query rule (see "Specificity gotcha" below).
- **`@keyframes`.** Variants like `rtl:` don't reach inside `@keyframes` blocks. Duplicate the keyframe and gate it with a `[dir="rtl"]` parent selector if the animation moves horizontally — see `ContextPanelHost.svelte` for the pattern.
- **`space-x-*` / `divide-x-*`.** Tailwind v4's `space-x-reverse` story is awkward. Prefer migrating to `gap-*`; the codemod skips these on purpose.

## Directional icons

Lucide icons don't auto-flip. Use the [`DirectionalIcon`](../src/lib/components/ui/DirectionalIcon.svelte) wrapper for semantic chevrons and back-arrows:

```svelte
<script>
    import DirectionalIcon from '$lib/components/ui/DirectionalIcon.svelte';
</script>

<DirectionalIcon name="chevron-forward" size={14} />
<DirectionalIcon name="arrow-back" size={16} />
```

Available names: `chevron-forward`, `chevron-back`, `chevrons-forward`, `chevrons-back`, `arrow-forward`, `arrow-back`.

`ChevronUp` and `ChevronDown` are vertical and stay put — never flip them.

For one-off cases (e.g. a FontAwesome glyph from plugin GPM metadata), use the `.flip-rtl` utility class — it applies `transform: scaleX(-1)` in RTL only.

## Code never reverses

Markdown source, code editors, syntax-highlighted blocks, and CodeMirror gutters are pinned `dir="ltr"` even when the admin UI runs RTL. Source code is always left-to-right regardless of the user's language. The pinning lives in:

- `src/lib/components/editors/MarkdownEditor.svelte`
- `src/lib/components/editors/CodeEditor.svelte`
- editor-pro's `RawMarkdownMode.js`

If you add a new code/source-style field, set `dir="ltr"` on the wrapper element.

## Specificity gotcha: `[dir="rtl"]` vs media queries

`rtl:` variant compiles to a `[dir="rtl"]` attribute selector, which has specificity `0,1,0`. A plain media-query rule like `lg:translate-x-0` is `0,0,0`. So:

```html
<!-- BROKEN: at lg+ in RTL, the sidebar stays pushed off-screen -->
<aside class="-translate-x-full rtl:translate-x-full lg:translate-x-0">
```

The `rtl:translate-x-full` rule keeps winning even at `lg+`. Scope it with `max-lg:` so the RTL slide-off only applies on small screens:

```html
<aside class="max-lg:-translate-x-full max-lg:rtl:translate-x-full lg:translate-x-0">
```

This bit us in `AppShell.svelte`; if you ever pair an `rtl:` transform with a responsive variant, watch for the same pattern.

## Plugin web components

Plugins that ship custom field web components should:

1. Read direction from `window.__GRAV_I18N.dir` (don't assume `<html dir>` — it's authoritative but `__GRAV_I18N` is the documented contract).
2. Subscribe to `window.__GRAV_I18N.subscribe(fn)` so a live language switch updates the component without a reload.
3. Use logical CSS in any shadow-DOM stylesheets they ship.
4. Wrap code/source-style fields in `dir="ltr"` regardless of admin direction.

Editor-pro's TipTap field does this — see `grav-plugin-editor-pro/admin/assets/editor-pro.js` for the reference implementation: `editorProps.attributes.dir` from `getEditorDir()`, plus a `_i18nUnsub` subscription wired up in `onCreate` and torn down in `onDestroy`.

## Translations

Strings authored under the `ICU.*` namespace in `grav-plugin-admin2/languages/en.yaml` are the source of truth. Arabic (`ar.yaml`) and Hebrew (`he.yaml`) ship machine-quality translations covering admin2's surface; they're flagged for a native-speaker review pass.

When adding new admin-next strings:
1. Add the English key under `ICU.ADMIN_NEXT.*` in `en.yaml`.
2. Add the same key (translated) to `ar.yaml` and `he.yaml`. Use ICU plural / select syntax where appropriate.
3. Reference it from Svelte via `i18n.t('ADMIN_NEXT.KEY', { …params })`.

See [`i18n.md`](i18n.md) and the [grav-translations skill](../../grav-skills/grav-translations/SKILL.md) for the broader translation pipeline.

## Tooling

- **Codemod**: `npm run --silent` then `node scripts/rtl-pairs.mjs` — rewrites physical Tailwind utilities to their logical equivalents across `.svelte` files.
- **Audit**: search for `<ChevronLeft\|<ChevronRight\|<ArrowLeft\|<ArrowRight\|ml-\|mr-\|pl-\|pr-\|text-left\|text-right\|border-l\b\|border-r\b\|rounded-l-\|rounded-r-\|absolute right-0\|absolute left-0` to find leftovers before opening a PR. Most hits should be intentional (transforms, vertical chevrons, etc.) — review case-by-case.
