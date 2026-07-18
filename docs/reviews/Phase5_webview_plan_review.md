# Phase 5 Plan Review — Webview Panels, Multi-Extension UI & Cross-Extension Services

This report reviews the draft implementation plan: [2026-07-18-phase5-webviews-multiextension.md](file:///d:/finance_flow_ai/docs/superpowers/plans/2026-07-18-phase5-webviews-multiextension.md).

---

## Technical Gaps & Ambiguities

### 1. UI Integration of Child `BrowserWindow` Webviews
- **The Issue:** The plan proposes implementing `WebviewPanel` using a child `BrowserWindow` (Decision 1) instead of an `<iframe>`. However, in a tabbed workspace, editor tabs and split panes are rendered inside the main window's HTML DOM. 
- **The Gap:** A child `BrowserWindow` is a separate top-level operating system window. It cannot naturally be clipped, nested, or scrolled inside HTML elements (like tabs/panes) without window-repositioning hacks that sync coordinates and sizes on resize or drag-to-split.
- **The Contradiction:** The text repeatedly refers to "mounting iframes" or "webview panel iframes," which directly contradicts using a top-level `BrowserWindow` child.
- **Recommendation:** Clarify the rendering and positioning mechanism. If child `BrowserWindow`s are used, detail how their bounds sync with the tabs/splits in the main window. If they are floating windows (as in VS Code's pop-out windows), amend the layout descriptions.

### 2. State Loss on Lazy Unmount
- **The Issue:** Decision 8 unmounts (destroys) WebviewPanels that have been unfocused for >30 seconds.
- **The Gap:** Any in-memory UI state (e.g., a half-filled payslip form) is lost when the panel is destroyed. Forcing the user to save or lose work upon switching tabs for 30 seconds degrades the user experience.
- **Recommendation:** Do not unmount panels that are dirty (contain unsaved form data). Allow panels to register a `dirty` state, or increase the unmount timeout for panels in active input flows.

### 3. File System Access (`file://`) from Custom Protocol (`finance-shell://`)
- **The Issue:** Task 15.1 loads the extension bundle using a script tag:
  ```html
  <script type="module" src="file:///path/to/dist/extensions/{extensionId}.js"></script>
  ```
- **The Gap:** Chromium blocks pages loaded over custom protocols (`finance-shell://`) from accessing local `file://` resources for security reasons ("Not allowed to load local resource").
- **Recommendation:** Serve the extension bundles through the custom protocol handler (e.g., `finance-shell://panel/extensions/{extensionId}.js`) instead of using `file:///` URLs directly in the script tag.

### 4. Cross-Extension `$join` Operator Contradiction
- **The Issue:** Decision 4 states that `$join` is only allowed on shared tables and the calling extension's own tables. 
- **The Gap:** The Dashboard is the calling extension for aggregation. Since `accounts` is the only shared table, and Dashboard has no tables of its own, the Dashboard cannot join `salary_history_pay_slips` (which is private to `salary-history`). This makes the `$join` operator unusable for the Dashboard's net worth / payslip aggregations.
- **Recommendation:** Promote `salary_history_pay_slips` to a Shared Financial Data table, or allow read-only cross-extension joins under specific allowlist rules. Alternatively, clarify that Dashboard performs this aggregation in-memory in JS after retrieving data via the domain service.

### 5. Multi-Extension Process Security Gaps
- **The Issue:** All extensions share a single background Extension Host Node.js process. Main enforces command and UI event allowlists (Decisions 6 and 7) based on the declared caller ID.
- **The Gap:** Because there is no process isolation *between* extensions (only between the Host and Main), a compromised or malicious extension can read/write the memory of other extensions in the Host, spoof the calling extension ID in JSON-RPC payloads, or invoke target methods directly.
- **Recommendation:** Acknowledge that the allowlists in Main protect against developer errors/accidental calls rather than malicious extensions. For true security, evaluate running separate Host processes per extension in Phase 8.

---

## Suggested Improvements

### 1. Structured Join Conditions Instead of Raw SQL Strings
- **The Issue:** Task 6.3 builds a parser to validate raw SQL `on` clauses (e.g., `on: 'a.col = b.col'`).
- **Improvement:** Pass a structured object instead:
  ```ts
  $join: {
    table: 'accounts',
    on: { left: 'account_id', right: 'id' },
    type: 'LEFT'
  }
  ```
  This is 100% injection-safe by design, avoids fragile string parsing, and simplifies schema validation against manifests.

### 2. Configurable Default Tab/View
- **The Issue:** Decision 2 sorts `onStartup` activations alphabetically by extension ID and sets the first one as the active tab.
- **Improvement:** Introduce an explicit settings configuration (e.g., `core.workspace.defaultView = 'dashboard'`) to determine the default landing view, rather than relying on the alphabetical order of extension IDs.

### 3. Allowlist Denials Console Logging inside Webview
- **The Issue:** Disallowed UI events are silently dropped by Main with a terminal warning.
- **Improvement:** Route the warning back to the originating panel's DevTools console so extension developers see the allowlist violation immediately during testing.
