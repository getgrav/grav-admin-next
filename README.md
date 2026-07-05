# grav-admin-next

**SvelteKit source for [Admin2](https://github.com/getgrav/grav-plugin-admin2)** — the modern administration panel for [Grav CMS](https://github.com/getgrav/grav).

This repository contains the single-page application that ships inside the `grav-plugin-admin2` plugin. It talks to Grav exclusively through the [Grav API plugin](https://github.com/getgrav/grav-plugin-api) — there is no direct coupling to Grav's PHP render pipeline or Twig.

> **Status: Alpha.** Under active development for Grav 2.0.

## Architecture at a glance

- **SvelteKit 5 (runes) + Tailwind 4** — built with `@sveltejs/adapter-static`, output is a fully static SPA.
- **bits-ui + lucide-svelte** — headless component primitives and icons.
- **CodeMirror 6** — embedded code/markdown/YAML editor.
- **Uppy** — media uploads.
- **API-driven** — every data operation is a call to the Grav API plugin. Auth, pages, config, users, media, plugins, themes, tools, etc., are all HTTP requests. No server-rendered Twig.

All runtime configuration (server URL, API prefix, base path, environment) is injected by the host plugin as `window.__GRAV_CONFIG__` — the SPA reads this on boot.

## Repositories

| Repo | Role |
| --- | --- |
| [`grav-admin-next`](https://github.com/getgrav/grav-admin-next) | This repo — SvelteKit UI source |
| [`grav-plugin-admin2`](https://github.com/getgrav/grav-plugin-admin2) | Grav plugin that serves the built SPA |
| [`grav-plugin-api`](https://github.com/getgrav/grav-plugin-api) | JSON HTTP API the SPA consumes |

## Getting started

Clone as a sibling of the plugin so the build script can find it automatically:

```
cd /path/to/your/workspace
git clone https://github.com/getgrav/grav-admin-next.git
git clone https://github.com/getgrav/grav-plugin-admin2.git
```

Install dependencies:

```
cd grav-admin-next
npm install
```

## Development

**Standalone dev server** (Vite, hot reload, no Grav required — useful for pure UI work against a mocked backend):

```
npm run dev
```

**Plugin-mode dev build** (watches and writes output directly into the sibling `grav-plugin-admin2/app` directory, so you can reload a real Grav site and see changes):

```
npm run dev:plugin
```

This is equivalent to `ADMIN2_BASE=/grav-api/admin2 vite build --watch`. Override `ADMIN2_BASE` to match your Grav root + plugin route if you are not running against `http://localhost/grav-api/admin2`.

## Production build

Build into the plugin's `app/` directory:

```
npm run build:plugin
```

Or from the plugin itself:

```
cd ../grav-plugin-admin2
./bin/build.sh
```

The plugin's `bin/build.sh` invokes `npm run build` here with the correct `ADMIN2_BASE` and copies the `build/` output into `grav-plugin-admin2/app/`.

## Environment variable

| Variable | Purpose |
| --- | --- |
| `ADMIN2_BASE` | SvelteKit `paths.base`. Must match the Grav site root + Admin2 route (e.g. `/grav-api/admin2`). When unset, the app builds at the root and behaves like a standard dev SPA. When set, `svelte.config.js` also redirects `adapter-static` output into `../grav-plugin-admin2/app`. |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run dev:plugin` | Watched build into the plugin's `app/` directory |
| `npm run build` | Production SPA build to `build/` |
| `npm run build:plugin` | Production build into the plugin's `app/` directory |
| `npm run preview` | Preview the production build locally |
| `npm run check` | `svelte-check` with the project TS config |
| `npm run lint` | Prettier + ESLint |
| `npm run format` | Prettier write |

## Right-to-left languages

Admin-next supports RTL admin languages (Arabic, Hebrew, Persian, Urdu — anything `LanguageCodes::isRtl()` flags). The boot path sets `<html dir="rtl">` from the user's `adminLanguage` preference and exposes `window.__GRAV_I18N.dir` for plugin web components to read.

See [`docs/RTL.md`](docs/RTL.md) for the conventions: when to reach for Tailwind's logical utilities (`ms-*` / `me-*` / `border-s` / `text-start`), when the `rtl:` variant is the right tool, the directional-icon wrapper, and the "code stays LTR" rule.

## Extension icons

Extension APIs that expose icon fields can use the shared `IconSpec` contract for Font Awesome, other loaded CSS icon sets, bundled Lucide icons, and safe structured SVG icons.

See [`docs/IconSpec.md`](docs/IconSpec.md) for the supported shorthands and SVG safety rules.

## Contributing

Issues and pull requests are welcome. For bugs that are clearly about the PHP wrapper or static asset delivery, open them on [`grav-plugin-admin2`](https://github.com/getgrav/grav-plugin-admin2/issues); for API shape or data questions, open them on [`grav-plugin-api`](https://github.com/getgrav/grav-plugin-api/issues); for everything UI, open them here.

## License

MIT
