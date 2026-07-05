# IconSpec

Extension APIs that expose icon fields can return either a string shorthand or a structured `IconSpec` object.

Use strings for common cases:

```php
'icon' => 'clock';                 // Font Awesome solid: fa-solid fa-clock
'icon' => 'fa:clock';              // Font Awesome solid
'icon' => 'fa-regular:clock';      // Font Awesome regular
'icon' => 'fa-brands:github';      // Font Awesome brands
'icon' => 'class:ti ti-user';      // Any icon CSS classes already loaded by Admin2
'icon' => 'lucide:user-round-check'; // Bundled lucide-svelte icon
```

Structured objects are available when a string is not enough:

```php
'icon' => [
    'type' => 'class',
    'class' => 'bi bi-person',
];

'icon' => [
    'type' => 'lucide',
    'name' => 'user-round-check',
];
```

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
