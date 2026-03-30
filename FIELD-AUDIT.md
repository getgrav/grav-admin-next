# Field Type Audit: Admin Plugin vs Admin-Next

> Generated: 2026-03-29

## Fully Implemented (27 types)

These work properly in admin-next:

| Type | Component | Notes |
|------|-----------|-------|
| `text` | TextField | + all HTML5 variants |
| `email`, `url`, `tel`, `password`, `number` | TextField | mapped via inputTypes |
| `date`, `time`, `month`, `week` | TextField | native HTML5 inputs |
| `color` | TextField | native color input |
| `hidden` | TextField | renders hidden input |
| `textarea` | TextareaField | |
| `markdown` / `editor` | MarkdownField | |
| `select` | SelectField | incl. multiple, data-options@ |
| `selectize` | SelectizeField | incl. create, multiple |
| `toggle` / `switch` | ToggleField | |
| `checkbox` | inline | |
| `checkboxes` | inline | |
| `radio` | inline | |
| `range` | inline | |
| `display` | inline | |
| `spacer` | SpacerField | |
| `datetime` | DateTimeField | |
| `dateformat` | DateFormatField | |
| `colorpicker` | TextField (color) | remaps to native color |
| `array` | ArrayField | key-value + value-only |
| `list` | ListField | nested fields |
| `tabs` / `tab` | TabsField | |
| `section` / `fieldset` | SectionField | |
| `columns` / `column` | inline grid | |
| `folder-slug` | FolderSlugField | |
| `pages` / `parents` | PagesField | |
| `taxonomy` | TaxonomyField | |
| `pagemedia` | PageMediaField | |
| `cron` | CronField | |
| `multilevel` | MultilevelField | |
| `themeselect` | ThemeSelectField | |

## Correctly Suppressed/Skipped (6 types)

| Type | Reason |
|------|--------|
| `order` / `blueprint` | Handled by admin-next UI directly |
| `xss` / `nonce` / `honeypot` / `ignore` | Non-visible system fields |

## Needs Implementation (13 types)

### High Priority — used in page/config editing

| Type | Where Used | What It Does |
|------|-----------|--------------|
| `filepicker` | Page blueprints, plugin configs | Browse & select files from the filesystem. Currently "coming soon" placeholder |
| `mediapicker` | Page blueprints, plugin configs | Browse & select media assets. Currently "coming soon" placeholder |
| `file` | Page blueprints, form plugin | File upload with drag-drop. Currently "coming soon" placeholder |
| `elements` / `element` | Typhoon theme, SEO Magic plugin, many themes | A select that conditionally shows/hides child fieldsets based on selection. Think of it as a "select + conditional sections" combo. Used heavily in theme configs |
| `conditional` | User accounts blueprint | Shows/hides fields based on another field's value. Important for dynamic forms |
| `frontmatter` | Raw page editing mode (`pages/raw.yaml`) | Raw YAML editor for page frontmatter. Uses CodeMirror |
| `codemirror` | Raw page editing, expert mode | Generic code editor (YAML, JSON, etc.) — distinct from markdown editor |
| `iconpicker` | Theme modular blueprints (features), plugins | Font Awesome icon browser/selector |
| `permissions` | User groups, user accounts | Hierarchical permission tree with checkboxes. Critical for user management |
| `acl_picker` | Page security partials | Access control list picker for page-level permissions |

### Medium Priority — used in specific contexts

| Type | Where Used | What It Does |
|------|-----------|--------------|
| `pagemediaselect` | Some page blueprints | Select dropdown populated from page's media files. Extends filepicker |
| `selectunique` | Niche admin usage | Select where each value can only be used once across a list |
| `colorscheme` / `colorscheme.color` | Theme configuration | Multi-swatch color scheme editor |

## Not Needed for Admin-Next (10 types)

| Type | Reason |
|------|--------|
| `backupshistory` | Dashboard-specific widget |
| `cronstatus` | Scheduler status display |
| `themepreview` | Theme admin preview only |
| `userinfo` | User profile display widget |
| `webhook-status` | Webhook display widget |
| `widgets` | Dashboard widget selector |
| `avatar` | User profile only (could reuse `file`) |
| `captcha` / `recaptcha` / `basic-captcha` / `turnstile` | Frontend form submission only |
| `formname` / `formtask` / `uniqueid` / `key` / `value` / `signature` / `filepond` | Form plugin processing only |
| `select_optgroup` | Rarely used, can fall back to regular select |

## Kitchen Sink Test Page

A comprehensive test page exists at `user/pages/kitchen-sink/kitchen-sink.md` using the `kitchen-sink` template (Typhoon theme). It includes every implemented field type across 9 tabs (3 inherited from default + 6 custom):

- **Content** — title, markdown editor, page media (inherited)
- **Options** — publishing, taxonomy (inherited)
- **Advanced** — settings, overrides, routes (inherited)
- **Text Inputs** — text, email, url, tel, password, number, date, time, month, week, datetime, dateformat, color, colorpicker + toggleable/disabled/readonly variants
- **Editors** — textarea, markdown, editor
- **Selections** — select (single, multiple, data-options@), selectize, toggle, switch, checkbox, checkboxes, radio
- **Range & Display** — range (with step variants), display, spacer
- **Complex Types** — array (key-value, value-only, toggleable), list (simple, complex with 3-level nesting, collapsed), fieldset, columns
- **Pages & Taxonomy** — pages, parents, taxonomy, filepicker, mediapicker, file (placeholders)
- **Advanced Types** — cron, multilevel, columns layout, validated fields (required, pattern, min/max)

Blueprint: `grav-theme-typhoon/blueprints/kitchen-sink.yaml`
Template: `grav-theme-typhoon/templates/kitchen-sink.html.twig`

## Summary (updated 2026-03-30)

- **Implemented:** 37 types (~95% of real-world usage)
- **Remaining:** selectunique, colorscheme/colorscheme.color (niche)
- **Permissions/acl_picker:** functional placeholder, needs API endpoint for full permissions tree

### Implemented in 2026-03-30 batch:
- `filepicker` / `mediapicker` / `pagemediaselect` → FilePickerField (shared media context, image thumbnails, auto-clear on delete)
- `file` → FileField (Uppy upload, Grav-compatible keyed object format, shared media sync)
- `elements` / `element` → ElementsField (select-driven conditional child fieldsets)
- `conditional` → ConditionalField (client-side condition evaluation)
- `frontmatter` / `codemirror` → FrontmatterField + CodeEditor (CM6 with YAML language, dark mode)
- `iconpicker` → IconPickerField (1422 FA6 free solid icons, search, grid picker)
- `permissions` / `acl_picker` → PermissionsField (three-state toggles: allowed/denied/not set)

### YAML Compatibility Test (2026-03-30)
- Grav round-trip save: **IDENTICAL** (byte-for-byte)
- API round-trip (GET → PATCH same header): **IDENTICAL** (byte-for-byte)
- API PATCH with modified field: correctly updates only the changed field
- All field formats (toggles, arrays, lists, checkboxes, taxonomy, etc.) serialize correctly
