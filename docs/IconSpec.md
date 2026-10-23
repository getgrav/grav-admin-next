# IconSpec

Extension APIs that expose icon fields can return either a string shorthand or a structured `IconSpec` object.

Use strings for common cases:

```php
'icon' => 'clock';                 // Font Awesome solid: fa-solid fa-clock
'icon' => 'fa:clock';              // Font Awesome solid
'icon' => 'fa-regular:clock';      // Font Awesome regular
'icon' => 'fa-brands:github';      // Font Awesome brands
'icon' => 'class:ti ti-user';      // Any icon CSS classes already loaded by Admin2
```

Structured objects are available when a string is not enough:

```php
'icon' => [
    'type' => 'class',
    'class' => 'bi bi-person',
];
```

For a custom glyph, send structured SVG data (below). Font Awesome and the
`class:` form both reuse icon CSS the admin already loads, so they add nothing
to the bundle; SVG data lets a plugin ship its own glyph without pulling a
whole icon library into the admin build.

For custom SVG icons, prefer the safe single-path shorthand:

```php
'icon' => [
    'type' => 'svg',
    'viewBox' => '0 0 24 24',
    'path' => 'M20 21v-2a4 4 0 0 0-4-4H8...',
];
```

Advanced SVG icons can declare multiple whitelisted elements:

```php
'icon' => [
    'type' => 'svg',
    'viewBox' => '0 0 24 24',
    'elements' => [
        ['tag' => 'path', 'attrs' => ['d' => 'M20 21v-2a4 4 0 0 0-4-4H8...']],
        ['tag' => 'circle', 'attrs' => ['cx' => 12, 'cy' => 7, 'r' => 4]],
    ],
];
```

Raw SVG markup is not accepted. SVG icons are rendered from structured data only, with tag and attribute whitelists, so plugin-provided values cannot inject event handlers, scripts, or arbitrary markup.

The allowed shapes are `path`, `circle`, `ellipse`, `rect`, `line`, `polyline` and `polygon`. Icons are drawn as line icons: no fill, stroked in the current text color.

## Icon sets for the `iconpicker` field

On its own the `iconpicker` blueprint field lists Font Awesome and saves Font Awesome class names. A theme or plugin that draws its own icons can give the field its own set instead, so the owner picks from the icons the site actually draws. The field names the set:

```yaml
header.hero.icon:
  type: iconpicker
  label: Icon
  icons: encore
```

and the set's owner registers it on the API plugin's `onApiIconSets` event:

```php
public static function getSubscribedEvents(): array
{
    return ['onApiIconSets' => ['onApiIconSets', 0]];
}

public function onApiIconSets(Event $event): void
{
    $sets = $event['sets'];
    $sets['encore'] = [
        'label' => 'Encore',
        // name => SVG markup (a whole <svg>, or what goes inside one on a
        // 24px grid) or any IconSpec value
        'icons' => [
            'search' => '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
            'clock' => 'fa:clock',
        ],
        // or, instead of 'icons', a YAML file of name: markup lines:
        // 'file' => 'theme://icons.yaml',
    ];
    $event['sets'] = $sets;
}
```

The picker then shows that set, with each icon's name under it, and saves the icon's name (`search`), which is what the theme's own icon macro takes. The API turns markup into the structured SVG form above before it is sent, so the safety rules here apply to every set. A field that names a set nobody registered says so in its dropdown. The full description is in the API plugin's README, under "Icon sets for the `iconpicker` field".
