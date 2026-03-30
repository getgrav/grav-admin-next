# Admin-Next Architecture Risk Assessment

> Generated: 2026-03-29

Deep dive into the existing Grav admin plugin to identify potential show-stoppers for the admin-next (SvelteKit + API) approach.

## Verdict: No Show-Stoppers Found

The architecture is sound. Two significant risks were identified and one has already been resolved. The other (plugin UI extensibility) is a known planned item.

---

## RESOLVED: `$grav['admin']` Core Coupling

**Status: Fixed** (commit `14ba48b` — AdminProxy)

### The Problem

Grav core checks `isset($grav['admin'])` in ~8 places to alter behavior. Without this, API requests operated in "site" scope instead of "admin" scope, causing:

| Location | What Changed Without Admin |
|----------|--------------------------|
| `Pages.php:1047` | Non-routable/hidden pages invisible to API |
| `Pages.php:980` | Route resolution skipped site-based routes |
| `Pages.php:1395` | Page type detection (modular vs standard) didn't work |
| `Page.php:1261` | Blueprint edit mode not set |
| `FlexGravTrait.php:60` | `isAdminSite()` returned false — Flex `PageObject::save()` didn't fire onAdminSave/AfterSave/AfterDelete compat events |
| `FlexDirectory.php:893` | Flex blueprints not extended with admin-only fields |
| `FlexObject.php` | Authorization scope was 'site' instead of 'admin' |
| `Utils::isAdminPlugin()` | Returned false — plugins checking `$this->isAdmin()` wouldn't activate |
| `Plugin.php:416` | `inheritedConfigOption()` used wrong page source |
| `GravExtension.php:966` | Translation fell through to frontend path instead of admin translate() |
| `GravExtension.php:1208` | Authorization checking used regular user instead of admin user |
| `AccountsServiceProvider.php:107` | Admin route details unavailable |

### The Fix

`AdminProxy` — a lightweight class (~180 lines) registered as `$grav['admin']` during authenticated API requests. Implements only the 5 methods and 2 properties that core actually accesses:

- `page()`, `getPage()` — page resolution
- `getRouteDetails()` — returns `[base, location, route]` tuple
- `blueprints($type)` — blueprint loading
- `translate($args, $languages)` — admin translation
- `$user` property — the authenticated API user
- `$route` property — current route

Registered in `ApiRouter::process()` after authentication. 14 integration tests verify correct behavior.

### What AdminProxy intentionally doesn't do

- **No Flex user conversion** — the real Admin constructor converts file-based users to Flex users when Flex Objects plugin is present. This requires the full Flex Objects dependency. Can be added later if needed.
- **`getPage()` returns null for missing pages** — the real admin auto-creates placeholder pages for its own UI routing. Not needed for API.

---

## PLANNED: Plugin UI Extensibility

**Status: Not yet implemented — known planned work**

### The Problem

The current admin's UI extensibility model is entirely Twig-based:

| Extension Point | Mechanism | Used By |
|----------------|-----------|---------|
| Sidebar menu items | `onAdminMenu` → `plugins_hooked_nav` array | Flex Objects, SEO Magic, Data Manager, Comments |
| Quick tray actions | `onAdminMenu` → `plugins_quick_tray` array | Cloudflare, SEO Magic, Algolia Pro |
| Dashboard widgets | `onAdminDashboard` → `plugins_hooked_dashboard_widgets_*` | Various plugins |
| Custom admin pages | `onAdminPage` + `admin/pages/*.md` files | Flex Objects, Data Manager, Cloudflare |
| Custom templates | `onAdminTwigTemplatePaths` → path registration | Most admin-extending plugins |
| Custom form fields | `getFormFieldTypes()` + field Twig templates | Admin, Flex Objects |
| Task handlers | `onAdminTaskExecute` → AJAX endpoints | Cloudflare, AI Pro, SEO Magic |

Admin-next uses Svelte, not Twig. Existing plugin admin UI cannot render directly.

### Why It's Not a Show-Stopper

1. **Plugin configuration pages already work** — they're blueprint-driven, rendered through the existing blueprint system via the API. No Twig needed.
2. **Only plugins with custom admin pages** (not just config) need Svelte integration. Most plugins only have config forms.
3. **The API layer is the data contract** — plugins that need CRUD can use the API without any UI.
4. **This is already a planned item** — custom Svelte UI integration, sidebar registration, and quick tray.

### Recommended Approach

1. **Plugin registration API**: New event `onAdminNextRegister` that lets plugins declare:
   - Menu items (label, icon, route, permission)
   - Quick tray actions
   - Dashboard widgets (Svelte component URL or iframe URL)
   - Custom page routes (Svelte component URL or iframe URL)
2. **Dual rendering support**: Native Svelte components for first-class plugins, iframes as fallback for any plugin that provides a web UI
3. **Task endpoint passthrough**: API endpoint that proxies `onAdminTaskExecute` so existing plugin AJAX handlers work

### Plugins that would need attention

- **Flex Objects** — custom list/edit UI (heavily used)
- **SEO Magic** — dashboard + reporting panels
- **Data Manager** — form data viewer
- Any plugin with `admin/pages/*.md` files

---

## IMPORTANT: Page-Level ACL Enforcement

**Status: Not yet implemented**

### The Problem

The admin enforces per-page permissions via `header.permissions.authors` and `header.permissions.groups` (defined in `system/blueprints/pages/partials/security.yaml`). The API currently only checks endpoint-level permissions (`api.pages.write`).

A user with `api.pages.write` can edit ANY page, even ones restricted to specific authors/groups.

### The Fix

Add page-level authorization checks in `PagesController` before save/delete operations:

```php
private function authorizePageAccess(PageInterface $page, UserInterface $user): void
{
    $permissions = (array) ($page->header()->permissions ?? []);
    if (empty($permissions)) {
        return; // No page-level restrictions
    }

    // Check authors list
    $authors = $permissions['authors'] ?? [];
    if ($authors && !in_array($user->username, $authors)) {
        // Check groups
        $groups = $permissions['groups'] ?? [];
        $userGroups = $user->get('groups', []);
        if ($groups && empty(array_intersect($groups, $userGroups))) {
            throw new ForbiddenException('No permission to edit this page');
        }
    }
}
```

### Priority

Medium — most Grav sites don't use page-level ACLs, but it's a security gap for multi-author setups.

---

## MANAGEABLE: Other Risks

These are all incremental feature work, not architectural risks.

### Flex User Conversion (Medium)

The admin constructor converts file-based users to Flex users when Flex Objects plugin is present. The AdminProxy doesn't do this. Impact: subtle permission differences if a site uses Flex Users. Fix: add conversion logic to AdminProxy or API auth middleware.

### Security Gaps (Medium)

| Gap | Notes |
|-----|-------|
| No 2FA for API keys | API key/JWT auth has no second factor. Normal for stateless APIs but worth noting. |
| No brute force protection on API auth | Rate limiter is general (120 req/min), not targeted at auth failures. Should track auth failures separately. |
| JWT secret in config file | Should support environment variable override. |

### Missing Admin Features (Low — incremental)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Backup system | Low | Expose as API endpoint |
| Raw/expert YAML editing | Low | CodeMirror YAML mode (partially built) |
| White-label theming | Low | Different approach in admin-next (CSS variables vs SCSS) |
| Notifications/feeds | Low | API endpoint + client-side rendering |
| Modular page editing | Low | Blueprint-driven, already works |
| Page copy | Low | Missing API endpoint, easy to add |
| Cache management | Low | Already partially exposed via API |
| Log viewer | Low | API endpoint to read log files |
| Scheduler UI | Low | API endpoint exists |

### Core Behavior Differences (Low)

| Behavior | Impact |
|----------|--------|
| Pages `setCheckMethod('hash')` | Admin uses hash-based cache validation; API uses default. Could cause stale page cache in rare cases. |
| `Pages::disablePages()` | Both admin and API disable pages on init, enable on demand. Already aligned. |
| Admin theme replacement | Admin replaces `$grav['themes']` with custom Themes class. API doesn't need this. |

---

## Plugin Extensibility Surface Area (Reference)

Complete list of hooks plugins use to extend the admin:

| Hook | Purpose | Admin-Next Strategy |
|------|---------|-------------------|
| `onAdminMenu` | Add sidebar items | New registration API |
| `onAdminDashboard` | Add dashboard widgets | New registration API |
| `onAdminPage` | Custom admin pages | Svelte component / iframe |
| `onAdminTwigTemplatePaths` | Template registration | Not applicable (no Twig) |
| `onAdminTaskExecute` | Custom AJAX tasks | API passthrough endpoint |
| `onAdminControllerInit` | Controller modification | Not applicable |
| `onAdminData` | Modify edit data | Evaluate per use-case |
| `onAdminSave` / `onAdminAfterSave` | Save hooks | **Already firing from API** |
| `onAdminAfterDelete` | Delete hooks | **Already firing from API** |
| `onAdminCreatePageFrontmatter` | Frontmatter injection | **Already firing from API** |
| `onAdminAfterAddMedia` / `onAdminAfterDelMedia` | Media hooks | **Already firing from API** |
| `onAdminAfterSaveAs` | Page rename/move | **Already firing from API** |
| `onAdminPageTypes` / `onAdminModularPageTypes` | Custom page types | Should fire from data resolver |
| `onAdminRegisterPermissions` | Custom permissions | Already registered via PermissionsRegisterEvent |
| `getFormFieldTypes()` | Custom field metadata | Need field type registry API |
| `onFormRegisterTypes` | Custom form factories | Evaluate if needed |
| `onAdminGenerateReports` | System reports | Future API endpoint |
| `onAdminLogFiles` | Log file registration | Future API endpoint |
| `onAdminTools` | Tools registration | Future registration API |
| `onAdminListContentEditors` | Editor registration | Not applicable (own editors) |

---

## Summary

| Risk | Severity | Status |
|------|----------|--------|
| `$grav['admin']` core coupling | High | **Resolved** — AdminProxy |
| Plugin UI extensibility | High | **Planned** — known work item |
| Page-level ACLs | Medium | **Not yet implemented** |
| Flex user conversion | Medium | Deferred — low real-world impact |
| Security hardening | Medium | Incremental improvements needed |
| Missing admin features | Low | All incremental, no blockers |
