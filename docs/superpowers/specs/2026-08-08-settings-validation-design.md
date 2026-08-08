---
title: Settings Screen — Input Validation & Format Display (formatted inputs)
date: 2026-08-08
last_updated: 2026-08-08T12:30:00+10:00
status: active
target_version: 0.9.0
spec_source: docs/superpowers/plans/2026-08-02-phase7-production-polish.md (Task 2)
---

# Settings Screen — Input Validation & Format Display

## Problem

`src/renderer/components/settings-screen.ts` currently lets users type anything into
formatted settings inputs. The financial-year inputs normalize input via a `format`
function, but unrecognized input passes through unchanged and is committed to the
settings database. There is no way to tell the user what format is expected, and no
way to reject malformed values. The manifest configuration schema
(`src/extension-host/manifest-schema.ts`) supports only `key/type/label/default/enumOptions` —
it has no notion of a format pattern or placeholder.

## Scope

Validate settings items that declare a format/pattern (today: the financial-year inputs in
Core, and the financial-year / currency / tax-year string settings declared by the
`salary-history` and `dashboard` extension manifests). Number/enum/object/plain-string inputs
keep their current behavior (browser-native checks only).

Two delivery slices:

1. **Renderer + Core only** (delivered first): formatted inputs in `CORE_SETTINGS` get
   placeholder + helper text + block-write validation. No manifest/schema changes.
2. **Extension support** (delivered second): the manifest schema and `ManifestConfigurationContribution`
   gain optional `pattern` / `formatHint` / `placeholder` string fields; the renderer compiles
   string patterns from extension configs and validates them identically; extension manifests
   declare format metadata for their string settings. Extensions cannot declare a JS `format`
   normalizer (JSON manifests), so they get validation + hints but no auto-formatting.

## Design

### 1. Item metadata (`ExtensionSettings.items[]`)

Extend the internal item shape with two optional fields used only by formatted inputs:

| Field | Type | Meaning |
|---|---|---|
| `pattern` | `RegExp` | Canonical form the formatted value must match (full-string). |
| `formatHint` | `string` | Human-readable format description (e.g. `YYYY-YYYY`). |

### 2. Formatted inputs

- **`core.financialYear.current`**
  - `pattern: /^\d{4}-\d{4}$/`, `formatHint: 'YYYY-YYYY'`
  - placeholder: `2025-2026` (example)
  - persistent helper text below the field: `Format: YYYY-YYYY`
  - `format: formatFinanceYear` (existing) normalizes `20252026`, `2025-26`, etc.

- **`core.financialYear.start`** — becomes a formatted input:
  - New `formatFinanceYearStart(raw)` normalizer: trims, pads single digits
    (`7-1` → `07-01`), accepts `0701` → `07-01`, passes `07-01` through.
  - `pattern: /^\d{2}-\d{2}$/`, `formatHint: 'MM-DD'`, placeholder: `07-01`.

### 3. Validation behavior (block write + show error)

Per W3C / web.dev guidance (validate on blur, clear on input, keep helper text visible):

- On `change` (blur): normalize via `format`, then test against `pattern`.
  - **Valid** → commit via the existing debounced `_commit(key, value)`.
  - **Invalid** → do **not** save. The input keeps the typed (normalized) text so the
    user can correct it; a red error state with a message renders under the field;
    the last valid value remains in the `_values` map and in settings. Mark the
    control with `aria-invalid="true"` and `aria-describedby` pointing at the
    error/helper element.
- On `input` (typing): clear the error state for that key (non-intrusive; don't nag
  while the user is mid-edit).
- Error + helper text are rendered as persistent elements beneath the control, so the
  format guidance does not disappear when the user types (placeholder is supplementary).

### 4. Styling

Invalid control: red border + error text in red below the field. Driven by JS state,
not the browser tooltip, so behavior is consistent and accessible.

### 5. Extension-declared settings

- **Manifest schema** (`src/extension-host/manifest-schema.ts`,
  `configurationContributionSchema`): add optional `pattern: string`, `formatHint: string`,
  `placeholder: string`. Add a `.refine` validating `pattern` compiles as a valid
  `RegExp` — a malformed pattern rejects the manifest at load time.
- **Type** (`src/types/finance.d.ts`, `ManifestConfigurationContribution`): mirror the three
  optional fields.
- **Renderer**: the item shape's `pattern` becomes `RegExp | string`. When rendering an
  extension config item, a string `pattern` is compiled to `RegExp` before validation.
  Behavior (placeholder + helper text + block-write + error-clear-on-input) is identical to
  Core; the only difference is extensions have no `format` function, so no auto-formatting.
- **Extension manifests**:
  - `salary-history`: `financialYearStart` → `MM-DD`, `paygTaxYear` → `YYYY-YYYY`,
    `financeYear` → `YYYY-YYYY`.
  - `dashboard`: `financialYearStart` → `MM-DD`, `financeYear` → `YYYY-YYYY`.
  - Placeholder examples: `07-01` for MM-DD, `2025-2026` for YYYY-YYYY.

## Out of scope

- Declarative format normalization for extensions (a JSON-serializable transform language)
  — YAGNI; extensions get validation + hints, not auto-formatting.
- Validation for non-formatted inputs (plain strings without pattern, numbers, enums, objects).

## Testing

Extend `tests/unit/renderer/settings-screen.test.ts`:

1. `formatFinanceYearStart` normalizes `0701` → `07-01`, `7-1` → `07-01`, passes `07-01`.
2. Invalid FY value (e.g. `hello`) is **not** committed — `settings.set` not called and
   error message rendered.
3. Valid FY value commits normally.
4. Error state clears on subsequent input.
5. FY start renders with placeholder + helper text.

Extend `tests/unit/extension-host/manifest-schema.test.ts`:

6. Configuration contribution with `pattern`/`formatHint`/`placeholder` validates.
7. Invalid `pattern` string (e.g. `'['`) rejects the manifest.
8. `pattern`/`formatHint`/`placeholder` are optional (existing configs still validate).

Extend `tests/unit/renderer/settings-screen.test.ts`:

9. An extension config item with a string `pattern` validates and blocks invalid writes.
