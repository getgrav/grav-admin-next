# Admin Events Audit: Admin Plugin vs API Plugin

> Generated: 2026-03-29

## Overview

The admin plugin fires **24 named events** (prefixed `onAdmin*`). Many third-party plugins subscribe to these events for critical functionality (SEO Magic, auto-date, comments-pro, mega-frontmatter, etc.).

The API plugin fires its **own events** (prefixed `onApi*`) but does **NOT** fire any `onAdmin*` events. This means plugins relying on `onAdminSave`, `onAdminAfterSave`, etc. will not be triggered when content is modified via the API or admin-next.

### Why Flex PageObject Events Don't Help

Grav's Flex `PageObject::save()` does fire `onAdminSave`/`onAdminAfterSave` for backwards compatibility, but **only when `isAdminSite()` returns true** — which checks `isset($container['admin'])`. Since the API plugin doesn't initialize the admin's `Admin` object, these events never fire for API requests.

---

## Event Classification

### CRITICAL — Must fire from API (data integrity / plugin compatibility)

These events are subscribed to by third-party plugins that modify data during save operations. Without them, plugins like SEO Magic, auto-date, mega-frontmatter, etc. will silently fail.

| Event | Admin Plugin Location | What It Does | API Equivalent | Integration Strategy |
|-------|----------------------|--------------|----------------|---------------------|
| `onAdminSave` | AdminController:217,359,1753,2034 | Fires **before** save for config, user, or page. Object passed by reference — plugins can modify it before persistence. | `onApiBeforePageUpdate`, `onApiBeforePageCreate` | Fire alongside `onApi*` events, passing `['object' => &$obj]` (and `'page' => &$obj` for pages). Must fire **before** `$page->save()` so plugins can modify the object. |
| `onAdminAfterSave` | AdminController:220,362,1761,2041 | Fires **after** successful save. Plugins use this for indexing, cache busting, notifications. | `onApiPageUpdated`, `onApiPageCreated`, `onApiUserUpdated`, `onApiConfigUpdated` | Fire alongside `onApi*` events, passing `['object' => $obj]` (and `'page' => $obj` for pages). |
| `onAdminAfterDelete` | AdminController:1926 | Fires after a page is deleted. Used by SEO Magic for index cleanup. | `onApiPageDeleted` | Fire alongside `onApiPageDeleted`, passing `['object' => $page, 'page' => $page]`. |
| `onAdminCreatePageFrontmatter` | Admin.php:2087 | Fires when creating new page frontmatter. Plugins like auto-date inject fields (e.g., created date). | None | Fire in `PagesController::create()` after building the header array, passing `['header' => &$header, 'data' => $data]`. |
| `onAdminAfterAddMedia` | AdminController:2626 | Fires after media upload to a page. | `onApiMediaUploaded` | Fire alongside `onApiMediaUploaded`, passing `['object' => $page, 'page' => $page]`. |
| `onAdminAfterDelMedia` | AdminController:2817 | Fires after media file deletion from a page. | `onApiMediaDeleted` | Fire alongside `onApiMediaDeleted`, passing `['object' => $page, 'page' => $page, 'media' => $media, 'filename' => $filename]`. |
| `onAdminAfterSaveAs` | AdminController:1633 | Fires after a page is saved with a new folder name (rename). | `onApiPageMoved` (partial) | Fire when a page move involves a folder rename, passing `['path' => $new_path]`. |

### IMPORTANT — Should fire from API (extensibility / permissions)

These events support admin extensibility. While not data-critical, they ensure plugins that register custom page types, permissions, or routes work correctly.

| Event | Admin Plugin Location | What It Does | API Relevance | Integration Strategy |
|-------|----------------------|--------------|---------------|---------------------|
| `onAdminPageTypes` | Admin.php:1009 | Allows plugins to modify the list of available page types. | **Yes** — the API's `/data/resolve` endpoint for `Pages::pageTypes` should fire this so plugins can add custom types. | Fire when resolving page types, passing `['types' => &$types]`. |
| `onAdminModularPageTypes` | Admin.php:1043 | Same as above for modular page types. | **Yes** — same reasoning. | Fire when resolving modular types, passing `['types' => &$types]`. |
| `onAdminRegisterPermissions` | Admin.php:1372 | Lets plugins register custom admin permissions. | **Yes** — permissions discovery should include plugin-registered ones. | Fire during permission resolution. |
| `onAdminData` | Admin.php:954 | Fired when getting admin data type information. Plugins can modify. | **Maybe** — depends on whether config/blueprint resolution needs it. | Evaluate per use-case. |
| `onAdminControllerInit` | AdminController:84 | Fires when the admin controller initializes. | **No** — API has its own controller lifecycle. | Not needed. |
| `onAdminTaskExecute` | AdminBaseController:129 | Fires for custom admin tasks without dedicated methods. | **No** — API has its own task/route system (`onApiRegisterRoutes`). | Not needed. |

### UI-ONLY — Not relevant for API

These events are specific to the admin's Twig-based UI rendering, dashboard display, or white-label theming. An external admin interface (admin-next) handles these concerns on the frontend.

| Event | What It Does | Why Not Needed |
|-------|-------------|---------------|
| `onAdminPage` | Determines which admin page template to render | Admin-next has SvelteKit routing |
| `onAdminTwigTemplatePaths` | Adds Twig template paths for admin | No Twig in admin-next |
| `onAdminMenu` | Builds admin sidebar navigation | Admin-next builds its own nav |
| `onAdminDashboard` | Builds dashboard widgets | Admin-next has its own dashboard |
| `onAdminTools` | Registers tools in admin Tools section | Could be relevant later for plugin tools |
| `onAdminListContentEditors` | Lists available content editors (e.g., TinyMCE) | Admin-next uses its own editors |
| `onAdminGenerateReports` | Generates system reports | Could expose via API endpoint later |
| `onAdminLogFiles` | Lists log files for viewer | Could expose via API endpoint later |
| `onAdminThemeInitialized` | After admin theme init | No admin theme in admin-next |
| `onAdminCompilePresetSCSS` | White-label SCSS compilation | No SCSS in admin-next |

---

## Implementation Plan

### Phase 1: Fire critical events alongside existing API events

The cleanest approach is to fire `onAdmin*` events **in addition to** the existing `onApi*` events (not replacing them). This way:
- Existing API webhook subscriptions continue working via `onApi*`
- Third-party Grav plugins that listen for `onAdmin*` now work with the API too

#### Suggested implementation in `AbstractApiController`:

```php
/**
 * Fire an admin-compatible event alongside the API event.
 * This ensures plugins subscribing to onAdmin* events work
 * regardless of whether changes come from the admin UI or the API.
 */
protected function fireAdminEvent(string $name, array $data = []): Event
{
    $event = new Event($data);
    $this->grav->fireEvent($name, $event);
    return $event;
}
```

#### PagesController changes:

```php
// In create(), before $page->save():
$this->fireAdminEvent('onAdminCreatePageFrontmatter', ['header' => &$header, 'data' => $body]);
$this->fireAdminEvent('onAdminSave', ['object' => &$page, 'page' => &$page]);

// In create(), after $page->save():
$this->fireAdminEvent('onAdminAfterSave', ['object' => $page, 'page' => $page]);

// In update(), before $page->save():
$this->fireAdminEvent('onAdminSave', ['object' => &$page, 'page' => &$page]);

// In update(), after $page->save():
$this->fireAdminEvent('onAdminAfterSave', ['object' => $page, 'page' => $page]);

// In delete(), after deletion:
$this->fireAdminEvent('onAdminAfterDelete', ['object' => $page, 'page' => $page]);

// In move(), after rename:
$this->fireAdminEvent('onAdminAfterSaveAs', ['path' => $newPath]);
```

#### MediaController changes:

```php
// After upload:
$this->fireAdminEvent('onAdminAfterAddMedia', ['object' => $page, 'page' => $page]);

// After delete:
$this->fireAdminEvent('onAdminAfterDelMedia', [
    'object' => $page, 'page' => $page,
    'media' => $media, 'filename' => $filename
]);
```

#### UsersController changes:

```php
// Before user save (create/update):
$this->fireAdminEvent('onAdminSave', ['object' => &$user]);

// After user save:
$this->fireAdminEvent('onAdminAfterSave', ['object' => $user]);
```

#### ConfigController changes:

```php
// Before config save:
$this->fireAdminEvent('onAdminSave', ['object' => &$obj]);

// After config save:
$this->fireAdminEvent('onAdminAfterSave', ['object' => $obj]);
```

### Phase 2: Page type events

Add `onAdminPageTypes` and `onAdminModularPageTypes` firing in the data resolver or wherever page types are enumerated for the API, so plugins that register custom page types are included.

### Phase 3: Optional — Expose UI-only events as API endpoints

Some UI-only events could become API endpoints later:
- `onAdminGenerateReports` → `GET /api/reports`
- `onAdminLogFiles` → `GET /api/logs`
- `onAdminTools` → `GET /api/tools`

These aren't urgent but would allow admin-next to offer the same functionality.

---

## Third-Party Plugin Usage (observed in codebase)

| Plugin | Events Subscribed | What It Does |
|--------|-------------------|-------------|
| **SEO Magic** | `onAdminAfterSave`, `onAdminAfterDelete` | Updates SEO index when pages change |
| **Auto Date** | `onAdminCreatePageFrontmatter` | Injects `date` field into new page headers |
| **Mega Frontmatter** | `onAdminSave`, `onAdminAfterSave` | Processes and merges frontmatter |
| **Comments Pro** | `onAdminAfterSave` | Syncs comment data when pages save |
| **Admin Pro** | `onAdminSave` | Additional save processing |
| **Admin Whitebox** | `onAdminSave` | White-label save hooks |
| **Email Office365** | `onAdminAfterSave` | Triggers email on config save |
| **AI Pro** | `onAdminSave` | AI content processing on save |

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Critical (must fire from API) | 7 | **Implemented** (2026-03-29) |
| Important (should fire) | 4 | **Not implemented** — needed for full compatibility |
| UI-only (not needed) | 10 | N/A |
| API-only events (already exist) | 23 | Working — keep as-is |

The `fireAdminEvent` helper approach keeps the implementation clean and doesn't require changing the existing `onApi*` event system. Both event families fire, giving maximum compatibility.

## Implementation Status (2026-03-29)

All 7 critical events have been implemented via `fireAdminEvent()` in `AbstractApiController`:

| Event | Controller | Method(s) |
|-------|-----------|-----------|
| `onAdminCreatePageFrontmatter` | PagesController | `create()` |
| `onAdminSave` | PagesController | `create()`, `update()`, `translate()` |
| `onAdminAfterSave` | PagesController | `create()`, `update()`, `translate()` |
| `onAdminAfterDelete` | PagesController | `delete()` (both full and language-specific) |
| `onAdminAfterSaveAs` | PagesController | `move()` |
| `onAdminSave` | UsersController | `create()`, `update()` |
| `onAdminAfterSave` | UsersController | `create()`, `update()` |
| `onAdminSave` | ConfigController | `update()` (wraps data in `Data` object) |
| `onAdminAfterSave` | ConfigController | `update()` |
| `onAdminAfterAddMedia` | MediaController | `uploadPageMedia()` |
| `onAdminAfterDelMedia` | MediaController | `deletePageMedia()` |
