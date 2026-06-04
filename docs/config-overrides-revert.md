# Config override indicators + per-field revert

Status: planned (Phase 1 backend in progress). Owner: Andy.

Show, on every config field, whether it actually overrides the value beneath it,
and let the user roll that override back. Works for the base/"Default" view and
for environment overlays with one shared mechanism.

## 1. Mental model: a stack of layers

Every config scope is a stack of files, each overriding the one below:

```
Base / "Default":   [ core/plugin defaults ]  <-  [ user/config/<scope>.yaml ]
An environment:     [ core/plugin defaults ]  <-  [ user/config/<scope>.yaml ]  <-  [ user/env/<env>/config/<scope>.yaml ]
```

- System: `system/config/system.yaml` (defaults) <- `user/config/system.yaml`
- Plugin: `user/plugins/foo/foo.yaml` (defaults) <- `user/config/plugins/foo.yaml`
- Env: all of the above <- `user/env/<env>/config/...`

A field is **overridden** when the **top (active) layer's file** holds a value
that differs from what the layers below would resolve to. **Revert** deletes
that key from the active layer's file, so the value falls back to the layer
beneath. The indicator shows only when the field is present in the active
layer's file, so it mirrors the YAML on disk exactly.

One mechanism covers base and env. Only two things change with the active layer:
which file is written, and what the fallback is.

## 2. Existing machinery to reuse (ConfigDiffer)

The per-environment config work already computes everything:

| Need | Existing piece |
|---|---|
| Fallback (everything below the active layer) | `ConfigDiffer::parent(scope, targetEnv)` |
| Overridden keys (the active-layer delta) | `ConfigDiffer::diff(effective, parent)` |
| Active-layer file path | `baseFilePath` / `envFilePath` (private) |
| Remove a key + prune empty parents | `unsetDotPath` (private) |
| Persist only the delta | `ConfigController::writeConfigFile` |

The override set is exactly the delta `configEtagBasis()` already computes, so
the override map is almost free.

## 3. Decisions (locked)

1. **Override map delivery:** folded into `GET /config/{scope}` under `res.meta`
   (no extra round-trip; stays in lockstep with the snapshot + ETag).
2. **Revert API:** `POST /config/{scope}/revert` with `{ keys: [...] }` or
   `{ reset: true }`.
3. **Env-mode indicators:** active layer only. In an env, indicators reflect the
   `env/<env>/...` file and revert falls back to base; in base, they reflect
   `user/config` and revert falls back to core/plugin defaults. The active layer
   is always "the file you are looking at."
4. **Whole-scope reset:** exposed in the UI behind a `ConfirmModal`. For base
   this resets the scope to core/plugin defaults; for env it discards that
   env's overrides for the scope.

## 4. Backend (grav-plugin-api)

### 4a. Override metadata on the read
Augment `GET /config/{scope}` (respects `X-Config-Environment`) so `res.meta`
carries:
- `overrides`: dotted leaf paths present in the active-layer delta, e.g.
  `["pages.theme", "debugger.enabled"]`.
- `fallback`: the value each overridden key reverts to (dig
  `parent(scope, targetEnv)` at that path; absent -> blueprint default / unset).

### 4b. Revert endpoint
`POST /config/{scope}/revert` (honors `If-Match` and `X-Config-Environment`):
- `{ "keys": ["pages.theme"] }` -> load the active-layer file, `unsetDotPath`
  each key, prune empties, rewrite (delete the file if it empties out), clear
  cache, fire the same `onAdminAfterSave` + invalidation events as a save,
  return the new effective config + ETag.
- `{ "reset": true }` -> delete the active layer's whole `<scope>.yaml`.

Reuses `unsetDotPath` (promote from private) and the existing write/event path.

### 4c. Tests
Override-map correctness (base vs env, nested keys, atomic lists); revert removes
a key and falls back; revert that empties a file deletes it; whole-scope reset;
ETag concurrency; revert never touches a layer other than the active one.

## 5. Frontend (admin-next)

- **Plumb the map:** pass `res.meta.overrides` / `res.meta.fallback` into
  `BlueprintForm` as context keyed by dotted field path.
- **Per-field indicator:** a field renders a revert affordance only when its
  `name` is in `overrides`. Subtle dot/badge + `Undo2`/`RotateCcw` on
  hover/focus; tooltip "Overrides default `<fallback>`. Click to revert."
- **Revert click:** `POST /revert` for that key, then set the field value to the
  fallback and drop it from `overrides` (icon disappears). No full reload.
- **Scope reset:** a "Reset overrides" button in the config header next to Save,
  `ConfirmModal`-gated, `{ reset: true }`. Copy differs by layer.

## 6. Edge cases

- Atomic lists / object-bound fields: revert the whole subtree as one unit
  (the delta already treats lists atomically).
- `GRAV_CONFIG__*` env-var overrides aren't in any file and can't be
  file-reverted; they're stripped on save / re-applied on read. Phase 3: show a
  non-revertable "set by environment variable" badge instead of a revert icon.
- Field path <-> config path: match by dotted path (already aligned for scalar
  fields); object-bound fields match by prefix.

## 7. Phasing

1. Backend: override `meta` + revert/reset endpoints + tests. Independently
   shippable.
2. Frontend: per-field indicator + revert wiring + scope reset button.
3. Polish: env-var "forced" badge, object/array fields, i18n, a11y.
