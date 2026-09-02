# `<grav-blueprint-form>` — a plugin's settings, on the plugin's own page

A plugin that ships a component-mode admin page (`admin-next/pages/<slug>.js`) usually ends up with its settings in two places: the screens it draws itself, and the blueprint form the admin draws at `/plugins/<slug>`. People go looking for a setting on the plugin's own page, do not find it, and have to be sent somewhere else.

`<grav-blueprint-form>` closes that gap. The admin registers it at boot, so any plugin page can put the real settings form on one of its own screens:

```html
<grav-blueprint-form plugin="kahunacart"></grav-blueprint-form>
```

That is the same blueprint, the same field types (including any custom fields the plugin ships), the same required-field checks, the same save endpoint and the same per-field revert arrows as the admin's own settings page. Nothing is reimplemented, so a plugin cannot drift out of step with the admin.

## Attributes

| Attribute | What it does |
| --- | --- |
| `plugin` | The plugin slug whose settings to edit. |
| `theme` | The theme slug whose settings to edit. Use this instead of `plugin`, not as well. |
| `filter` | Show only the fields whose label, help text, name, title or description contains this text, with the match highlighted. Containers with no matching field inside them stay shut. Changing it re-filters straight away, so it can be wired to a search box the host page owns. |
| `hide-toolbar` | Present means the element does not draw its own Save row, because the host page has a Save button of its own and drives the form through `save()`. |
| `hide-fields` | Comma-separated blueprint field names to leave out, at any depth. For the field that only makes sense on the admin's own settings page — a blueprint carrying a "the rest of this plugin lives over there" notice does not want that notice on the page it is pointing at. |

Every attribute has a matching property (`el.filter = 'tax'`, `el.hideFields = ['open_store']`), and setting the property writes the attribute back, so either style works.

When a filter matches no field the form says so rather than going blank, in the same words the Configuration page uses.

## Events

All four bubble and cross shadow boundaries, so a page can listen on its own root rather than on the element.

| Event | `detail` | When |
| --- | --- | --- |
| `blueprint-ready` | `{ kind, slug, fields }` | The blueprint and the current values are loaded and on screen. |
| `blueprint-dirty` | `{ kind, slug, dirty }` | The form crossed from clean to dirty, or back after a save. |
| `blueprint-saved` | `{ kind, slug }` | The settings were written. |
| `blueprint-error` | `{ kind, slug, message }` | The settings could not be loaded or could not be saved, with the reason in plain words. |

`kind` is `plugins` or `themes`, and `slug` is the package the form is editing.

## Methods and properties

| Member | What it does |
| --- | --- |
| `save()` | Saves the form. Resolves `true` when the settings were written, `false` when a required field was empty or the save was refused. |
| `reload()` | Throws away what is on screen and reads the settings again. |
| `dirty` | `true` while the form is holding changes nobody has saved. Read it in a leave guard. |

## Where the element renders

The element renders into its own light DOM on purpose: the fields are styled by the admin's stylesheet, and a shadow root would cut them off from it.

Most plugin pages draw themselves inside a shadow root, and anything placed in there is out of the admin's reach. The fix is a slot. Put the element in the page element's light DOM, and put a `<slot>` where you want it to appear:

```js
// The page element is `grav-<slug>--page`, and it lives in the admin's own
// light DOM, so a child of it gets the admin's styles.
const form = document.createElement('grav-blueprint-form');
form.setAttribute('plugin', 'my-plugin');
form.setAttribute('slot', 'settings');
this.appendChild(form);

// Somewhere in the page's shadow root:
//   <slot name="settings"></slot>
```

Slotted content keeps its own styling, so the form arrives looking exactly as it does on the settings page even though it is drawn inside your shadow tree. Remove the child again when the screen closes.

## Sending `/plugins/<slug>` to the same place

Once a plugin renders its settings on its own page, the admin's `/plugins/<slug>` screen is a second copy of them. A plugin page definition can say so:

```php
$event['definition'] = [
    'id' => 'my-plugin',
    'plugin' => 'my-plugin',
    'title' => 'My Plugin',
    'page_type' => 'component',
    // Settings live on this page, at this hash route.
    'settings_route' => '#/settings',
];
```

`settings_route` is a hash route inside the plugin's own page. With it set, `/plugins/<slug>` redirects to `/plugin/<slug><settings_route>`, and the Configure button on the Plugins list goes straight there too, so there is only one place to look. The plugin's card on the Plugins list still handles updating, removing and enabling, and a disabled plugin never redirects — you still land on the admin's own page with the Enable button on it.
