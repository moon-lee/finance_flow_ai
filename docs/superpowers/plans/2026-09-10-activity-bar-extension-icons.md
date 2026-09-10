# Activity Bar Extension Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace extension letters with author-provided SVG/PNG icons in the Activity Bar while keeping tab icons unchanged, preserving legacy letter fallback, and adding the built-in Settings gear icon.

**Architecture:** Extension view manifests continue to use their existing `icon` field, but it accepts either a legacy one/two-character glyph or a validated relative asset path such as `assets/icon.svg`. The Main renderer resolves asset paths to the existing `finance-shell://extensions/<extensionId>/<asset>` protocol, while the Activity Bar decides whether to render an `<img>` or legacy text. Settings uses a built-in renderer asset and remains neutral; extension colors continue to apply only to the active Activity Bar icon background. Tab rendering is deliberately out of scope.

**Tech Stack:** TypeScript strict, Lit, Zod, Electron custom protocol, SVG/PNG assets, Vite, Vitest + happy-dom, SDK templates.

## Global Constraints

- Activity Bar only: do not modify `src/renderer/components/tab-bar.ts` or tab icon behavior.
- Active extension color remains the only extension color treatment: active Activity Bar icon background uses `themeColor`; inactive icons retain shared styling.
- SVG/PNG icons must be relative asset paths inside the extension package; reject absolute paths, protocol URLs, `..` traversal, and unsupported extensions.
- Legacy one/two-character `icon` values remain valid and render as text.
- Settings is Core-owned, uses a neutral built-in gear icon, and is not assigned an extension color.
- Extensions must provide a 20–24px-friendly icon with no text baked into the artwork.
- `finance` remains type-only in extension code; no extension may import Electron or filesystem APIs.
- Do not change package versions as part of implementation unless explicitly requested; update `CHANGELOG.md` under `Unreleased` and `docs/file-reference.md`.
- No runtime implementation is included in this plan execution now; this document is the only requested deliverable in the current session.

## Approved Visual Direction

Use the saved preview at `docs/design/finance-extension-icons-preview.svg` as the visual reference:

- Dashboard: rounded grid with trend line, teal accent.
- Salary History: rounded receipt/check, amber accent.
- Todo List: rounded checklist, sky-blue accent.
- Settings: neutral rounded gear, gray/white.
- Same rounded two-tone language for every icon.
- Tab icons remain exactly as currently implemented.

## File Map

| File | Responsibility |
|---|---|
| `src/types/finance.d.ts` | Document legacy glyph or relative SVG/PNG asset path. |
| `src/extension-host/manifest-schema.ts` | Validate icon values and reject unsafe asset paths. |
| `src/renderer/components/activity-bar.ts` | Render image icons or legacy glyphs; apply active-only color background. |
| `src/renderer/index.ts` | Convert manifest icon paths into safe renderer asset URLs and pass them to Activity Bar. |
| `src/renderer/public/icons/settings.svg` | Built-in neutral Settings icon. |
| `tests/unit/extension-host/manifest-schema.test.ts` | Manifest icon validation tests. |
| `tests/unit/renderer/activity-bar-color.test.ts` | Active-only color and image/glyph rendering tests. |
| `tests/unit/renderer/activity-bar-icons.test.ts` | Asset URL and Settings icon rendering tests. |
| `src/preload/preload.ts` / `src/types/finance-shell.d.ts` | Only change if the existing `extensions:list` inline types cannot carry the unchanged manifest icon field; no new IPC expected. |
| `scripts/sdk/templates/package.json.template` | Scaffold view manifest with `assets/icon.svg`. |
| `scripts/sdk/templates/assets/icon.svg` | Default extension icon asset copied by `sdk init`. |
| `scripts/sdk/cli.mjs` | Copy the new asset during `init`; include it in refresh only if the file is a generated SDK-owned file. |
| `scripts/sdk/types/finance.d.ts` | Mirror canonical manifest icon documentation. |
| `extensions/dashboard/assets/icon.svg` | Dashboard default icon. |
| `extensions/salary-history/assets/icon.svg` | Salary History default icon. |
| `d:/finance_flow_ext/todo-list/assets/icon.svg` | Todo List default icon. |
| `docs/extension-api.md` | Authoring contract and asset restrictions. |
| `docs/sdk-templates.md` | Explain what `init` creates and what existing projects must update manually. |
| `docs/file-reference.md` | Register the new built-in and extension icon assets. |
| `CHANGELOG.md` | Unreleased administrative/runtime change entry. |

---

### Task 1: Define and validate icon manifest values

**Files:**
- Modify: `src/types/finance.d.ts`
- Modify: `scripts/sdk/types/finance.d.ts`
- Modify: `src/extension-host/manifest-schema.ts`
- Modify: `tests/unit/extension-host/manifest-schema.test.ts`

**Interfaces:**
- Consumes: existing `ManifestViewContribution.icon: string`.
- Produces: validated icon values that are either a one/two-character legacy glyph or a safe relative `.svg`/`.png` path.

- [ ] **Step 1: Add failing schema tests**

Append tests covering the current `validManifest` fixture:

```ts
it('accepts a relative SVG icon asset path', () => {
  const result = validateManifest({
    ...validManifest,
    contributions: { views: [{ id: 'salary-history', name: 'Salary', icon: 'assets/icon.svg' }] },
  });
  expect(result.ok).toBe(true);
});

it('accepts a relative PNG icon asset path', () => {
  const result = validateManifest({
    ...validManifest,
    contributions: { views: [{ id: 'salary-history', name: 'Salary', icon: 'icons/salary.png' }] },
  });
  expect(result.ok).toBe(true);
});

it('keeps accepting a legacy one-character icon', () => {
  expect(validateManifest(validManifest).ok).toBe(true);
});

it('rejects unsafe or unsupported icon paths', () => {
  for (const icon of ['../icon.svg', '/icon.svg', 'C:\\icon.svg', 'https://example/icon.svg', 'assets/icon.js', 'assets/icon.svg?x=1']) {
    const result = validateManifest({
      ...validManifest,
      contributions: { views: [{ id: 'salary-history', name: 'Salary', icon }] },
    });
    expect(result.ok).toBe(false);
  }
});
```

- [ ] **Step 2: Run the focused schema test**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts`
Expected: the new asset-path tests fail because the current schema only allows one or two characters.

- [ ] **Step 3: Add a named icon validator**

In `src/extension-host/manifest-schema.ts`, define beside the activation schema:

```ts
const legacyIconSchema = z.string().min(1).max(2);
const assetIconSchema = z.string().regex(
  /^(?!.*\.\.)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*\.(?:svg|png)$/,
  'icon asset must be a relative .svg or .png path without traversal'
);
const iconSchema = z.union([legacyIconSchema, assetIconSchema]);
```

Replace `icon: z.string().min(1).max(2)` in `viewContributionSchema` with `icon: iconSchema`.

- [ ] **Step 4: Update the canonical type documentation**

Change the `ManifestViewContribution.icon` comment to:

```ts
  /**
   * Legacy one/two-character glyph or a relative extension asset path such as
   * `assets/icon.svg` / `assets/icon.png`. Activity Bar renders asset icons;
   * legacy values remain supported as text. Tab icons are unaffected.
   */
  icon: string;
```

Copy the canonical type file to `scripts/sdk/types/finance.d.ts` and keep the parity test passing.

- [ ] **Step 5: Run focused validation**

Run:

```bash
npx vitest run tests/unit/extension-host/manifest-schema.test.ts tests/unit/sdk/sdk-type-parity.test.ts
npm run typecheck
```

Expected: all schema/parity tests pass and typecheck reports no new errors.

---

### Task 2: Add renderer asset resolution and Activity Bar image rendering

**Files:**
- Modify: `src/renderer/components/activity-bar.ts`
- Modify: `src/renderer/index.ts`
- Create: `tests/unit/renderer/activity-bar-icons.test.ts`
- Modify: `tests/unit/renderer/activity-bar-color.test.ts`

**Interfaces:**
- Consumes: validated `view.icon`, `extensionId`, and `themeColors` from the existing `extensions.list()` payload.
- Produces: `ActivityView.iconUrl?: string`, with either `iconUrl` or legacy `icon` rendered by Activity Bar.

- [ ] **Step 1: Add the Activity Bar view field and rendering test**

Add a test-only view with both kinds of icon and assert the DOM shape:

```ts
it('renders image assets and legacy glyphs separately', async () => {
  if (!customElements.get('activity-bar')) customElements.define('activity-bar', ActivityBar);
  const element = document.createElement('activity-bar') as ActivityBar & {
    views: Array<{ id: string; name: string; icon: string; iconUrl?: string }>;
  };
  element.views = [
    { id: 'asset-view', name: 'Asset', icon: 'assets/icon.svg', iconUrl: 'finance-shell://extensions/demo/assets/icon.svg' },
    { id: 'legacy-view', name: 'Legacy', icon: 'L' },
  ];
  element.activeView = 'asset-view';
  document.body.appendChild(element);
  await element.updateComplete;
  expect(element.shadowRoot?.querySelector('img[data-view-id="asset-view"]')?.getAttribute('src'))
    .toBe('finance-shell://extensions/demo/assets/icon.svg');
  expect(element.shadowRoot?.querySelector('button[data-view-id="legacy-view"]')?.textContent?.trim()).toBe('L');
  document.body.removeChild(element);
});
```

- [ ] **Step 2: Run the focused renderer test**

Run: `npx vitest run tests/unit/renderer/activity-bar-icons.test.ts`
Expected: FAIL because `ActivityView` has no `iconUrl` and Activity Bar always renders text.

- [ ] **Step 3: Extend `ActivityView` and render assets**

Update the interface:

```ts
export interface ActivityView {
  id: string;
  name: string;
  icon: string;
  iconUrl?: string;
  color?: string;
}
```

In `render()`, replace the text-only content with:

```ts
${view.iconUrl
  ? html`<img class="activity-icon" data-view-id="${view.id}" src="${view.iconUrl}" alt="" aria-hidden="true" />`
  : view.icon}
```

Add styles:

```css
.activity-icon {
  width: 22px;
  height: 22px;
  display: block;
  object-fit: contain;
  pointer-events: none;
}
```

Keep the existing active-only inline background rule. The icon image itself must not inherit text color or become a tab icon.

- [ ] **Step 4: Add a pure URL helper in `src/renderer/index.ts`**

Add a local pure helper before `loadExtensionContributions()`:

```ts
function extensionIconUrl(extensionId: string, icon: string): string | undefined {
  if (!/^(?!.*\.\.)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9._-]+)*\.(?:svg|png)$/.test(icon)) return undefined;
  return `finance-shell://extensions/${encodeURIComponent(extensionId)}/${icon
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
```

In the Activity Bar mapping, return:

```ts
const iconUrl = extensionIconUrl(v.extensionId, v.view.icon);
return { id: v.view.id, name: v.view.name, icon: v.view.icon, iconUrl, color };
```

Legacy one/two-character icons produce `iconUrl: undefined` and remain text.

- [ ] **Step 5: Run focused renderer validation**

Run:

```bash
npx vitest run tests/unit/renderer/activity-bar-icons.test.ts tests/unit/renderer/activity-bar-color.test.ts
npm run typecheck
```

Expected: asset/glyph rendering, active-only background, and typecheck pass.

---

### Task 3: Add the built-in Settings icon

**Files:**
- Create: `src/renderer/public/icons/settings.svg`
- Modify: `src/renderer/components/activity-bar.ts`
- Modify: `tests/unit/renderer/activity-bar-icons.test.ts`

**Interfaces:**
- Consumes: the existing `activeView === '__settings__'` state.
- Produces: a built-in neutral Settings gear with no manifest or extension dependency.

- [ ] **Step 1: Add the approved Settings SVG**

Create `src/renderer/public/icons/settings.svg` using the preview language: transparent background, neutral `#858585` outer treatment, white gear outline, and gray center. The SVG must be simple enough to render at 22px and contain no text.

- [ ] **Step 2: Render Settings as an image**

Replace the current `S` content in the Settings button with:

```ts
<img
  class="activity-icon"
  src="/icons/settings.svg"
  alt=""
  aria-hidden="true"
/>
```

Do not apply an extension `color` style to Settings. Preserve its existing command/event behavior and bottom placement.

- [ ] **Step 3: Test Settings rendering**

Add:

```ts
it('renders the built-in Settings gear image', async () => {
  const element = document.createElement('activity-bar') as ActivityBar;
  document.body.appendChild(element);
  await element.updateComplete;
  const settings = element.shadowRoot?.querySelector('button.settings img');
  expect(settings?.getAttribute('src')).toBe('/icons/settings.svg');
  document.body.removeChild(element);
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/renderer/activity-bar-icons.test.ts`
Expected: all Activity Bar icon tests pass.

---

### Task 4: Add approved icons to built-in and standalone extensions

**Files:**
- Create: `extensions/dashboard/assets/icon.svg`
- Create: `extensions/salary-history/assets/icon.svg`
- Create: `d:/finance_flow_ext/todo-list/assets/icon.svg`
- Modify: `extensions/dashboard/package.json`
- Modify: `extensions/salary-history/package.json`
- Modify: `d:/finance_flow_ext/todo-list/package.json`
- Modify: `tests/unit/extension-host/manifest-schema.test.ts` or extension manifest fixtures

**Interfaces:**
- Consumes: Task 1 asset-path manifest validation and Task 2 renderer asset resolution.
- Produces: all current extensions use real Activity Bar icons; no tab behavior changes.

- [ ] **Step 1: Create the three SVG assets**

Use the approved preview geometry, with a square transparent canvas suitable for 22px display:

- Dashboard: teal rounded grid and white trend line.
- Salary History: amber rounded receipt and currency/check mark.
- Todo List: sky-blue rounded checklist with white checks.

Do not embed labels, large backgrounds, or unsupported external references inside these SVGs.

- [ ] **Step 2: Point each manifest view to the asset**

Replace only the Activity Bar view icon values:

```json
"icon": "assets/icon.svg"
```

Apply to Dashboard, Salary History, and Todo List. Do not change tab metadata or tab rendering.

- [ ] **Step 3: Build extension artifacts**

Run:

```bash
npm run build:extensions
Push-Location d:/finance_flow_ext/todo-list
npm run build
Pop-Location
```

Expected: built extension bundles remain valid and Todo List’s build artifact includes `assets/icon.svg` beside its packaged `package.json` and bundle. If the SDK build currently copies only `package.json` and JS, update the packaging step to copy declared icon assets and add a packaging test before proceeding.

- [ ] **Step 4: Verify manifest discovery**

Run: `npx vitest run tests/unit/extension-host/manifest-schema.test.ts`
Expected: all current manifests validate with asset paths.

---

### Task 5: Make the protocol serve extension icon assets safely

**Files:**
- Modify: `src/main/services/panel-protocol.ts`
- Modify: `tests/unit/main/services/panel-protocol.test.ts` (or create the repository’s established protocol test file if absent)
- Modify: `src/types/finance-shell.d.ts` only if a protocol helper type is needed

**Interfaces:**
- Consumes: `finance-shell://extensions/<extensionId>/<relativeAssetPath>` requests from the renderer.
- Produces: SVG/PNG responses from built-in or user extension roots with traversal prevention and correct MIME types.

- [ ] **Step 1: Add failing protocol tests**

Test these cases against the protocol handler’s existing test seam:

```ts
it('serves a declared extension SVG icon with image/svg+xml', async () => {
  const response = await request('/extensions/salary-history/assets/icon.svg');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('image/svg+xml');
});

it('serves a declared extension PNG icon with image/png', async () => {
  const response = await request('/extensions/todo-list/assets/icon.png');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('image/png');
});

it('rejects traversal and JavaScript asset requests', async () => {
  expect((await request('/extensions/salary-history/../package.json')).status).not.toBe(200);
  expect((await request('/extensions/salary-history/assets/icon.js')).status).not.toBe(200);
});
```

Adapt only the `request` fixture to the existing protocol test API; do not invent a second protocol server.

- [ ] **Step 2: Run protocol tests to verify the gap**

Run: `npx vitest run tests/unit/main/services/panel-protocol.test.ts`
Expected: SVG/PNG asset requests fail or return the current bundle/CSS handling behavior.

- [ ] **Step 3: Extend `/extensions/` serving**

In the existing `/extensions/` handler, distinguish:

- `<id>.js` → current bundle path logic.
- `<id>.css` → current CSS path logic.
- `<extensionId>/<relativeAssetPath>` → resolve only under the matching built-in/user extension directory.

Allow only `.svg` and `.png`, set `Content-Type` to `image/svg+xml` or `image/png`, and preserve the current user-extension-first resolution order. Never join an unvalidated path containing `..`, absolute roots, protocol prefixes, or a file outside the selected extension directory.

- [ ] **Step 4: Run protocol and type validation**

Run:

```bash
npx vitest run tests/unit/main/services/panel-protocol.test.ts
npm run typecheck
```

Expected: asset MIME, traversal rejection, existing bundle/CSS behavior, and typecheck pass.

---

### Task 6: Update SDK scaffolding and author documentation

**Files:**
- Create: `scripts/sdk/templates/assets/icon.svg`
- Modify: `scripts/sdk/templates/package.json.template`
- Modify: `scripts/sdk/cli.mjs`
- Modify: `scripts/sdk/templates/AGENTS.md.template`
- Modify: `docs/extension-api.md`
- Modify: `docs/sdk-templates.md`
- Modify: `docs/file-reference.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1 manifest contract, Task 3/5 asset paths, and existing `init`/`refresh` behavior.
- Produces: new SDK projects with a working default Activity Bar SVG; existing projects receive documentation/type refresh but retain author-owned manifest code.

- [ ] **Step 1: Update the SDK template manifest**

In `scripts/sdk/templates/package.json.template`, change:

```json
"views": [{ "id": "{{ID}}", "name": "{{DISPLAY_NAME}}", "icon": "assets/icon.svg" }]
```

Keep `themeColor` and its existing configuration entry unchanged.

- [ ] **Step 2: Add the default template asset**

Create `scripts/sdk/templates/assets/icon.svg` using a neutral two-tone generic extension symbol. It must be safe at 22px and contain no text. The SDK must copy it into `<new-extension>/assets/icon.svg` during `cmdInit`.

- [ ] **Step 3: Update SDK CLI copy behavior**

In `cmdInit`, create the `assets` directory and copy the template SVG. Do not make `refresh` overwrite author-owned `assets/icon.svg`; existing extensions must choose whether to replace their icon manually.

- [ ] **Step 4: Document author behavior**

Add to `docs/extension-api.md`:

```markdown
### Activity Bar icons

`contributes.views[].icon` accepts either a legacy one/two-character fallback or
an extension-relative `assets/*.svg` / `assets/*.png` path. Asset paths are
served only from the extension package and are rejected if they contain `..`,
absolute paths, protocols, or unsupported file types. Activity Bar renders the
asset at 22px; tabs are not affected by this setting. The active Activity Bar
button applies the extension `themeColor` as its background; inactive buttons
retain shared styling.
```

Update `docs/sdk-templates.md` to explain:

- `init` creates `assets/icon.svg` and points the generated manifest at it.
- `refresh` updates vendored types/styles/logger but does not overwrite a custom icon or `package.json`.
- Existing extensions must add `assets/icon.svg` and change their manifest `icon` value manually.

- [ ] **Step 5: Verify generated scaffolds**

Run:

```bash
node scripts/sdk/cli.mjs init icon-test D:\Temp
$manifest = Get-Content D:\Temp\icon-test\package.json -Raw | ConvertFrom-Json
if ($manifest.financeExtension.contributions.views[0].icon -ne 'assets/icon.svg') { throw 'icon manifest not generated' }
if (-not (Test-Path D:\Temp\icon-test\assets\icon.svg)) { throw 'icon asset not generated' }
Remove-Item D:\Temp\icon-test -Recurse -Force
```

Expected: scaffold includes the manifest path and asset file; no author code is modified by `refresh`.

---

### Task 7: Replace built-in Settings letter and complete tests/docs

**Files:**
- Modify: `src/renderer/components/activity-bar.ts` (Settings `<img>` path)
- Modify: `tests/unit/renderer/activity-bar-icons.test.ts`
- Modify: `tests/unit/renderer/activity-bar-color.test.ts`
- Modify: `docs/file-reference.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3 Settings asset and all prior renderer/protocol work.
- Produces: complete Activity Bar icon experience with no extension letters for opted-in extensions and no Settings letter.

- [ ] **Step 1: Add failing Settings regression**

Assert the built-in button renders:

```ts
expect(element.shadowRoot?.querySelector('button.settings img')?.getAttribute('src'))
  .toBe('/icons/settings.svg');
```

- [ ] **Step 2: Implement Settings rendering**

Render the built-in SVG with `alt=""` and `aria-hidden="true"`; preserve `.settings`, `title="Settings"`, `aria-label="Settings"`, active selection, and click behavior.

- [ ] **Step 3: Run the full focused suite**

Run:

```bash
npx vitest run \
  tests/unit/extension-host/manifest-schema.test.ts \
  tests/unit/renderer/activity-bar-icons.test.ts \
  tests/unit/renderer/activity-bar-color.test.ts \
  tests/unit/renderer/workspace.test.ts \
  tests/unit/sdk/sdk-type-parity.test.ts \
  tests/unit/main/services/panel-protocol.test.ts
npm run typecheck
npm run build
```

Expected: all focused tests, typecheck, and production build pass. Confirm no tests or code mention tab icon changes.

- [ ] **Step 4: Update documentation inventory and changelog**

Add icon asset rows to `docs/file-reference.md`. Under `CHANGELOG.md` `Unreleased`, add one user-visible `### Added` entry for Activity Bar asset icons and one `### Administrative` entry for SDK/docs changes. Update `last_updated`; do not bump package versions unless explicitly requested.

- [ ] **Step 5: Manual verification**

1. Launch the app with the built-in Dashboard, Salary History, and installed Todo List extensions.
2. Verify Activity Bar shows the three SVG icons plus the neutral Settings gear; no tab icon changes occur.
3. Activate each extension and verify only the active Activity Bar icon receives its extension-color background.
4. Disable an extension and verify its Activity Bar entry disappears through the existing enabled filter.
5. Install a legacy extension with `icon: "T"` and verify it still renders the text fallback.
6. Install a user extension with `icon: "assets/icon.svg"` and verify the user-extension asset is served, not the built-in asset.

## Self-Review

- [x] Activity Bar-only scope is explicit; tab files are untouched.
- [x] Existing legacy glyph manifests remain valid.
- [x] Asset path validation covers traversal, absolute paths, protocols, and file type.
- [x] Settings icon is Core-owned and neutral, not extension-colored.
- [x] Active-only extension background behavior is preserved.
- [x] Internal views do not need separate icons; the Activity Bar icon belongs to the contributed extension view.
- [x] SDK `init`/`refresh` ownership rules are explicit.
- [x] Tests cover schema, renderer DOM, protocol MIME/security, SDK generation, and regression behavior.
- [x] No implementation was performed while creating this plan.
