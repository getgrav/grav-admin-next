# `<grav-help>` — help text that follows the user's setting

Every field in the admin can carry a line of help text. Some people like to read it under the label, and some find a whole form of it cluttered. Settings has a **Help text** choice for each user (and a site default that new users start with), with two options:

- **Below the label** (the default): the help is a small muted paragraph under the field's label, as it has always been.
- **In a tooltip**: the help is hidden behind a small info icon right after the label. Hovering the icon or tabbing to it shows the help, and a click or tap pins it open so links inside it can be clicked. Escape, or a click or focus move elsewhere, closes it.

Fields drawn from a blueprint follow the setting on their own. A plugin that draws its own form (a component-mode page, a custom field, a settings screen in its own markup) has to opt in, and `<grav-help>` is how. The admin registers it at boot, so any plugin page can use it, including pages that draw themselves inside a shadow root.

## Usage

Put the help inside the element, next to the label it explains. Either place works:

```html
<!-- Inside the label -->
<label>Store name <grav-help>Shown on receipts and emails. <a href="/docs/store-name">More</a></grav-help></label>

<!-- Or straight after it -->
<label for="currency">Currency</label>
<grav-help>The currency prices are shown in. Changing it does not convert existing prices.</grav-help>
<select id="currency">…</select>
```

The help is ordinary markup, so links, `<code>` and `<strong>` all work. It is your own light DOM, which means your own styles apply to it, and you can build it with `innerHTML`, a template, or whatever your page already uses.

What the user sees:

- **Below the label:** the content is a paragraph, a block in `text-xs` size and the muted colour, with the same spacing as core help.
- **In a tooltip:** the element becomes the info icon, in line with the text around it, and the content moves into the same tooltip core fields use (at most 20rem wide, in the popover colours, light or dark, left to right or right to left).

The element follows the setting live. When the user changes it in Settings, every `<grav-help>` already on the page switches without a reload.

### Attributes

| Attribute | What it does |
| --- | --- |
| `label` | The accessible name of the icon, read by screen readers as "Help for <label>". You rarely need it: the element works the name out from the `<label>` it sits inside, or from a `<label>` right before it. Set it when there is no `<label>` (a heading, a table cell, a custom control), or when the label text is not what you want read out. Without any name the icon is just "Help". |

The `label` property reads and writes the same attribute.

### Good to know

- **One help per label.** The icon sits in the flow of the text around it. A label laid out as a flex or grid container turns the icon into one more item in that layout, so wrap the label text in a `<span>` or put `<grav-help>` after the label instead.
- **Clicks stay off your field.** When the element sits inside a `<label>`, clicking the icon or the words in the tooltip does not focus the field or flip a checkbox. Links inside the help still work.
- **Name the icon when there is no label.** The icon's name comes from the `<label>` around it or right before it. Help that sits in a heading, a table cell or a custom control has no such label, so give it a `label` attribute and the icon is named "Help for …" for screen readers instead of just "Help".
- **Shadow roots are fine.** The element draws itself in a shadow root of its own and takes its colours from the admin's custom properties (`--popover`, `--popover-foreground`, `--border`, `--muted-foreground`, `--ring`), which inherit through shadow boundaries. You do not need to load any CSS. The tooltip uses the browser's top layer, so a scroll container or a modal around it cannot clip or cover it.

## Older admins

`<grav-help>` only exists in an admin that registers it. On an older admin the browser treats it as an unknown inline element and shows its children as plain text, right where you put them. So the help is still readable, just always inline, with no paragraph styling and no icon. That is an acceptable fallback, and it means a plugin can adopt the element without checking the admin's version.

If you want the paragraph look on an older admin too, style the tag with `:not(:defined)`, which only matches while the element is unknown: `grav-help:not(:defined) { display: block; font-size: .75rem; opacity: .7 }`. On an admin that registers `<grav-help>` the rule never applies, so it cannot get in the way of the real element. Avoid a plain `grav-help { display: … }` rule for the same reason: it would override the element's own layout.

## For plugins that draw help their own way

If your plugin already has its own help component, or draws help somewhere `<grav-help>` does not fit, it can follow the setting directly:

- `document.documentElement.dataset.helpMode` is `inline` or `tooltip`. Read it at any time, and style from it, for example `html[data-help-mode="tooltip"] .my-hint { display: none }`.
- A `grav:help-mode` event fires on `document` whenever the mode changes, with `detail: { mode }`.

```js
const apply = (mode) => myForm.classList.toggle('help-in-tooltips', mode === 'tooltip');
apply(document.documentElement.dataset.helpMode);
document.addEventListener('grav:help-mode', (e) => apply(e.detail.mode));
```

The attribute can be missing on the very first frame of a page load, so treat a missing value as `inline`.

## Migrating a plugin

Find the help text your plugin draws under its labels, usually a hint paragraph:

```html
<label>Store name</label>
<p class="hint">Shown on receipts and emails.</p>
```

and swap it for the element:

```html
<label>Store name</label>
<grav-help>Shown on receipts and emails.</grav-help>
```

Then delete the CSS that styled the old hint, since the element styles itself. A few things to check while you are there:

1. Keep help that is a full sentence or two. Anything longer, or that has headings and lists, belongs in your documentation, with a link from the help.
2. Do not rely on the help for something a person must see to use the field (a warning, a unit, a required format). Put that in the label, a placeholder or a visible note, because tooltip users will not see it until they hover.
3. A hint that is not about one field, such as a note at the top of a screen, stays a normal paragraph.
4. Blueprint fields (`help:` in your YAML) need no change at all. The admin draws those.
