# Project Vision Review Report

**Date:** 2026-06-13
**Reviewed Documents:** `AGENTS.md`, `project_vision.md`
**Reviewer:** opencode (Model: MiniMax-M3)
**Status:** Review Complete - 31 Issues Identified (10 original + 5 follow-up + 6 third-pass + 10 architectural)

---

## 1. Review of `AGENTS.md`

`AGENTS.md` is concise and correctly outlines the behavioral rules. It has no internal contradictions. It functions as the behavioral contract (the "how" of working), which complements the architectural vision document (the "what").

---

## 2. Review of `project_vision.md`

The document is exceptionally well-structured and perfectly captures the VS Code aesthetic. However, a detailed review revealed 30 areas of inconsistency, missing detail, and technical non-sense that should be addressed before this becomes a hard technical reference.

---

### Issue 1: The "Core vs. Extension" Database Owner Contradiction
-- fixed and updated -project_vision.md

**The Contradiction (Lines 36, 99, 141):**
* Line 36 (Development Rules): `"No Finance Logic Inside Core... No interest calculators, tax bracket structures, or category managers can be written in Core."`
* Line 99 (Core Platform): `"Database Access: SQLite connection, migrations, transactions, and backups."`
* Line 141 (The Secure Extension API): `await finance.database.query("SELECT * FROM transactions WHERE amount > ?", [100]);`

**The Problem:** The Development Rules (Line 48) specify that *"One extension must never perform write/update queries directly on another extension's tables"* and that tables must be strictly namespaced (e.g., `ext_budget_`). However, in the code example (Line 141), the extension is doing a raw, unrestricted `SELECT *` on a generic `transactions` table. This bypasses the schema-validated, strict-namespace rule and opens a massive security and architectural hole. It turns the Core into a simple, unfiltered SQL proxy.

**Suggested Fix:** The API cannot just be a raw `database.query`. It should enforce strict schema ownership. For example: `await finance.extensions.budget.db.find({ amount: { $gt: 100 } })` or a query method that validates the SQL string against the extension's own table prefixes.

---

### Issue 2: The "Tagline / Project Name" Mismatch
-- fixed and updated -project_vision.md

**The Contradiction (Line 5 & Line 384):**
* The file is titled "Project Vision," and the Long-Term Vision section refers to the platform as **"DayFlow"** (Line 384).
* There is no other mention of "DayFlow" in the file. The project is consistently referred to simply as "the platform" or "the application."

**The Problem:** Introducing a brand name in the very last section feels accidental, like a copy-paste error from a different document, and will confuse anyone reading the spec.

**Suggested Fix:** We should either consistently use "DayFlow" throughout, or remove it entirely and replace it with `<ProjectName>` until a name is officially decided.

---

### Issue 3: The Insecure "Open vs. Closed" Database Strategy
-- fixed and updated -project_vision.md

**The Contradiction (Lines 99, 263, 284):**
* The doc states (Line 99) Core owns DB access, and (Line 263) extensions "never open a direct connection".
* It also claims (Line 284) that "Core acts as a firewall, sanitizing inputs, validating parameters, and ensuring extensions cannot delete or alter unauthorized tables."

**The Problem:** A raw SQL string passed to `finance.database.query("SELECT * FROM transactions")` cannot be safely sanitized, introspected, or permission-controlled at runtime by a generic Core without a massive custom SQL parser. It is impossible to guarantee that the `transactions` table belongs to the calling extension, or that it isn't a malicious `DROP TABLE` command.

**Suggested Fix:** Remove the raw query promise from the example and replace it with a schema-bound data access object (DAO) approach (as suggested in Issue #1).

---

### Issue 4: "Settings" Conflict Between Core and Extensions
-- fixed and updated -project_vision.md

**The Contradiction (Lines 46, 101, 309):**
* Development Rules (Line 46) say: *"Settings must be namespaced identically to avoid settings pollution."*
* Core Platform (Line 101) lists `"Settings: User preferences, API keys, active themes, and provider configurations."` as a core responsibility.
* Core Services (Line 309) describes the Settings Service as managing *"theme settings... and pathways to database directories."*

**The Problem:** It is unclear who owns what. If Settings is a Core service, how do extensions safely inject their own settings into the Core's UI without violating the "no finance logic in core" rule? If an extension provides a "Tax Bracket Configuration" setting, is that considered a finance logic, or is it user data?

**Suggested Fix:** The Settings Service should act as a generic Key-Value store. Extensions register their own settings schemas in their `package.json` (as suggested in the `contributes` section on Line 128), and the Core merely provides the UI and persistence.

---

### Issue 5: The AI "Core Service" Privacy Contradiction
-- fixed and updated -project_vision.md

**The Contradiction (Line 25, 232):**
* Core Principles (Line 25) state: *"Local First: Your data is stored on your device, not in the cloud. It belongs to you."* and *"Privacy Focused: Completely private, offline-capable, and secure."*
* AI Assistant Panel (Line 232) allows `"Database Querying: Converts natural language questions into safe SQL reads..."`

**The Problem:** The AI Service is part of the Core, and it can apparently query the database and read financial data to pass to third-party LLMs (OpenAI, Gemini). By default, this is a massive privacy leak. Pushing your local financial data to OpenAI directly contradicts the "Privacy Focused" and "Local First" principles.

**Suggested Fix:** The vision document needs an explicit, default-deny privacy policy. Either 1) Strip PII before sending to external AI, 2) Require explicit, granular user opt-in per query type, or 3) Mandate local-only AI (Ollama) by default, with warnings before using cloud providers. We must clearly define how the "Core Service" ensures privacy when it talks to the cloud.

---

### Issue 6: The Mismatch Between "One Workspace" and "Multiple Webviews"
-- fixed and updated -project_vision.md

**The Contradiction (Line 222, 156):**
* Main Workspace (Line 222) says: *"Only one extension controls the workspace at any single moment... mounts the newly active workspace."*
* UI Rendering Layer (Line 156) says extensions can create a secure, sandboxed `WebviewPanel`.

**The Problem:** VS Code's editor allows splitting the main workspace into multiple groups (split-screen) or opening many tabs. A strict "Only one extension controls the workspace" rule kills the split-screen potential. The user can only have one window at a time. We must decide if we want a strict modal workspace or a multi-tab/multi-group workspace.

**Suggested Fix:** Change the wording to *"Only one primary extension controls the active workspace at a time, though tabbed interfaces and split views are supported."*

---

### Issue 7: "Performance Security" Typo
-- fixed and updated -project_vision.md

**The Contradiction (Line 132):**
* `"Performance Security: Even if an extension is executing a heavy, synchronous calculation..."`

**The Problem:** The term "Performance Security" is nonsensical. You probably meant "Performance & Stability" or "System Responsiveness."

**Suggested Fix:** Rename to `"System Stability"` or `"Process Isolation Benefits"`.

---

### Issue 8: The "Future PostgreSQL" Pipe Dream vs. Core's Strictness
-- fixed and updated -project_vision.md

**The Contradiction (Line 257, 99):**
* Phase 1 implies SQLite is fundamentally tied to the core, with the Core owning the raw SQLite connection and queries.
* Future Capability (Line 257) says: *"PostgreSQL Bridge: Built-in adapter interfaces will support linking to a private PostgreSQL instance for optional self-hosted cloud synchronization."*

**The Problem:** If the API is `finance.database.query("SELECT * FROM transactions")` (raw SQL), it works for SQLite, but the moment you introduce PostgreSQL, you hit dialect issues. The Core architecture must treat database access as a strict abstraction layer (DAOs) if a PostgreSQL bridge is a serious future goal.

**Suggested Fix:** We must update the Data Architecture to ensure the Core API speaks the language of a Database Adapter (e.g., Knex, Prisma, or our own custom DTOs), so that swapping the underlying database is a Core concern and does not break extensions.

---

### Issue 9: The Inter-Extension Communication Rule Contradicts the "Independent" Rule
-- fixed and updated -project_vision.md

**The Contradiction (Line 48, 42):**
* Line 42: *"Every extension must operate in isolation. An extension cannot assume that any other extension is active or installed unless declaratively specified as a peer dependency."*
* Line 48: *"Extensions must interact strictly through Core-mediated API commands (e.g., `finance.commands.execute('budget.getSummary')`)."*

**The Problem:** You say extensions must be independent and isolated, but simultaneously say they must be able to execute commands on each other (`budget.getSummary`). This creates a tightly coupled system. If the Budget extension is removed, the extension that depended on it crashes. This violates the "Do Not Break Other Extensions" rule and "Removability" rule on Line 47.

**Suggested Fix:** True isolation means that if the extension is missing, the Core returns a graceful `null` or `undefined` response. We must clarify that inter-extension communication is strictly *optional*, gracefully degrades if missing, and does not cause the requesting extension to crash.

---

### Issue 10: The "Local First" vs. "OpenCode" Provider
-- fixed and updated -project_vision.md

**The Contradiction (Line 65, 25):**
* Line 65: *OpenAI - opencode, kilocode* is listed as an AI provider.
* Line 25: Core principles claim "Local First" and "Privacy Focused".

**The Problem:** Sending your entire financial database query context to OpenAI's servers to be processed is fundamentally opposed to "Local First" and "Privacy Focused." We need to specify that cloud AI providers are opt-in, and data sanitization (removing names, account numbers) happens *before* the API call.

**Suggested Fix:** Add a note under the AI Providers section that "Cloud-based AI providers require explicit user opt-in and data is filtered/anonymized before transmission. Local providers (Ollama) are preferred for maximum privacy."

---

### Issue 11 (New A): Activity Bar "Switches" Workspace vs Multi-Tab Workspace
-- fixed and updated -project_vision.md

**The Contradiction (Line 201 vs Lines 238-241):**
* Line 201: *"Clicking an icon switches the active context of the Navigation Panel and the Main **Workspace**."*
* Lines 238-240: Workspace supports tabs, split-screen groups, and multiple concurrent extensions.

**The Problem:** "Switches the workspace" implies closing the current workspace view and replacing it. But the tab/split-screen model says users can have multiple tabs open side-by-side. In VS Code, clicking the Activity Bar icon does not close your editor tabs — it only changes the sidebar.

**Suggested Fix:** Reword to: *"Clicking an icon sets the active extension context. This opens a new tab in the Main Workspace (or focuses an existing one) and updates the Navigation Panel. Existing tabs remain open."*

---

### Issue 12 (New B): Table Naming Convention Mismatch
-- fixed and updated -project_vision.md

**The Contradiction (Line 48 vs Line 148):**
* Line 48: *"Extensions must namespace their database tables (e.g., `ext_tax_settings`, `ext_budget_items`)."*
* Line 148 (code example): `finance.extensions.budget.db.budget_items.find(...)`

**The Problem:** The rule says tables should be named with an `ext_` prefix, but the code example uses `budget_items` (no prefix). The DAO path already provides namespace isolation, so the redundant `ext_` prefix is unnecessary and confusing.

**Suggested Fix:** Remove the `ext_` prefix rule and use plain table names, since the DAO path enforces isolation structurally.

---

### Issue 13 (New C): Phase 1 and Phase 3 Database Scope Ambiguity
-- fixed and updated -project_vision.md

**The Contradiction (Lines 376-378 vs Lines 385-387):**
* Phase 1: *"Designing the basic SQLite connection layer."*
* Phase 3: *"Establishing core schemas, transaction standards, and automated migrations."*

**The Problem:** A connection layer without schemas is just an empty socket. What "core schemas" exist if Core has no finance logic? The scope split between Phase 1 and Phase 3 is vague and potentially circular.

**Suggested Fix:** Move SQLite connection setup to Phase 3. Phase 1 should be purely shell and UI scaffolding. Clarify Phase 3 schemas are infrastructure-only (extension registry, settings store, migration log), not finance data.

---

### Issue 14 (New D): "Instant Startup" Promise vs Heavy Architecture
-- fixed and updated -project_vision.md

**The Contradiction (Line 26 vs Lines 80-97, 134-137):**
* Line 26: *"Fast and Lightweight: **Instant startup**, snappy transitions..."*
* Architecture requires Electron init, manifest parsing, Extension Host spawn, DAO generation, SQLite migrations, and AI service initialization before the user sees a window.

**The Problem:** "Instant startup" (sub-100ms) is unrealistic with this architecture. The document makes a promise it cannot keep.

**Suggested Fix:** Replace "Instant startup" with "Quick shell startup with lazy-loaded extensions" — which matches VS Code's actual behavior and the declarative manifest approach already described in Section 1.

---

### Issue 15 (New E): "Keyboard-Friendly" Nowhere Defined
-- fixed and updated -project_vision.md

**The Problem (Line 24):**
* Principle 4: *"Built for power users with a fast, keyboard-friendly desktop UI (Electron)."*

**The Problem:** "Keyboard-friendly" is a promise with zero engineering detail. VS Code achieves this through Command Palette, Quick Open, keyboard shortcuts, and keyboard-navigable trees — none of which are mentioned anywhere in the document.

**Suggested Fix:** Replace vague "keyboard-friendly" with specific commitments: Command Palette, customizable keyboard shortcuts, and keyboard-navigable UI. Add a corresponding deliverable to the Development Roadmap.

---

### Issue 16: "OpenAI (opencode, kilocode)" Nonsense in AI Providers
*Deferred — user will decide later*

**The Problem (Line 70):**
* `"Cloud (opt-in only): OpenAI (opencode, kilocode), Gemini"`

**The Problem:** "opencode" and "kilocode" are not OpenAI products. These are AI coding assistants, not LLM models. OpenAI's products are GPT-4o, ChatGPT, etc. This looks like a copy-paste artifact from the generation context.

**Suggested Fix:** Replace with actual OpenAI model names (e.g., `OpenAI (GPT-4o)`) or simply list `OpenAI` without sub-product names.

---

### Issue 17: "Dedutions" Typo
-- fixed and updated -project_vision.md

**The Problem (Line 207):**
* `"Tax: Dedutions, PAYG ledger, and tax estimations."`

**Suggested Fix:** Change to `"Deductions"`.

---

### Issue 18: Cash Flow Missing from Activity Bar Examples
-- fixed and updated -project_vision.md

**The Contradiction (Lines 203-212 vs Lines 348-356):**
* Activity Bar examples list: Dashboard, Transactions, Budget, Tax, Mortgage, Property, Super, Reports, Settings.
* Initial Extensions list includes: Dashboard, Transactions, Budget, **Cash Flow**, Tax, Mortgage, Property, Super, Reports.

**The Problem:** "Cash Flow" is an Initial Extension but missing from Activity Bar examples. "Settings" is listed as an Activity Bar icon but is a Core service, not an extension. The two lists don't match.

**Suggested Fix:** Add "Cash Flow" to Activity Bar examples. (Settings is fine — it's a Core icon, not an extension.)

---

### Issue 19: `myfinance.db` Placeholder Name
*Deferred — user will decide app name later*

**The Problem (Lines 277, 321):**
* `"Stores all application data locally in a single file (myfinance.db)."`
* `"Manages the active connection to myfinance.db."`

**The Problem:** The database file is called `myfinance.db` but the project has no official name. This is a placeholder that should either be a real project name or a generic name like `workspace.db`.

**Suggested Fix:** Defer until a project name is chosen.

---

### Issue 20: WebviewPanels Described as Floating Windows
-- fixed and updated -project_vision.md

**The Contradiction (Line 241):**
* `"Extensions can also spawn their own sandboxed WebviewPanel windows (e.g., a pop-out chart, a modal form) that float independently of the main editor groups."`

**The Problem:** In VS Code, WebviewPanels are tabs within the editor, not independent floating windows. Floating windows would require Electron's BrowserWindow, which is a different (and much heavier) concept. This contradicts the "exactly like VS Code" claim.

**Suggested Fix:** Reword to describe WebviewPanels as tabs within editor groups, not floating windows.

---

### Issue 21: vision_review.md Says "10 areas" After Already Having 15
-- fixed and updated -vision_review.md

**The Problem (Line 18):**
* `"a detailed review revealed 10 areas of inconsistency"`

**The Problem:** The intro paragraph was never updated after the 5 follow-up issues were added.

**Suggested Fix:** Change to `"15 areas"`.

---

### Issue 22: Local First Principle Was Incompatible with Cloud AI
-- fixed and updated -project_vision.md

**The Contradiction (Line 21):**
* Original: `"Local First: Your data is stored on your device, not in the cloud. It belongs to you."`

**The Problem:** The principle said "not in the cloud" but the platform supports cloud AI providers (OpenAI, Gemini). This was a direct contradiction. The original phrasing also made "Cloud Optional" impossible to add honestly.

**Suggested Fix:** Change to "Local First, Cloud Optional" — all data stored locally by default, cloud services enabled explicitly by the user.

---

### Issue 23: No Shared Financial Data Layer — Who Owns Canonical Records?
-- fixed and updated -project_vision.md

**The Contradiction:**
* Core Principles say: "No Finance Logic Inside Core" and "Extensions Own the Domain."
* But what about canonical records like Accounts, Transactions, and Categories? If Budget and Tax both need transactions, do they each create their own copy?

**The Problem:** The document had no answer. There was a missing architectural layer between Core (no finance logic) and Extensions (private data). Without a shared data model, extensions would either duplicate records or bypass the isolation rules.

**Suggested Fix:** Add a "Shared Financial Data Layer" — platform-owned canonical records (Accounts, Transactions, Categories, Assets, Liabilities) that all extensions can read but not modify directly.

---

### Issue 24: Dashboard Described as Core Feature, Not Extension
-- fixed and updated -project_vision.md

**The Contradiction (Line 349):**
* Original: `"Dashboard: Core financial overview displaying Net Worth..."`

**The Problem:** If "No Finance Logic Inside Core" is a rule, then Dashboard (which displays financial data) should be an extension, not a Core feature. But the document listed it as an extension without explaining how it gathers data from other extensions.

**Suggested Fix:** Redefine Dashboard as an "Aggregator Extension" that reads from Shared Financial Data and installed extensions, gracefully handling missing extensions.

---

### Issue 25: AI Core contained Financial Intelligence it shouldn't have
-- fixed and updated -project_vision.md

**The Contradiction (Lines 258-263):**
* Core Responsibilities included: "Trend Analysis," "Narrative Reports," "Database Querying"

**The Problem:** "Trend Analysis" and "Narrative Reports" are financial intelligence. If Core must have no finance logic, the AI Service shouldn't contain analytical capabilities — those should live in extensions.

**Suggested Fix:** Split AI responsibilities into Core (Provider Management, Chat Sessions, Tool Execution, Context Building, Permission Management) and Extensions (each registers its own analytical tools).

---

### Issue 26: Privacy Policy Overpromised Perfect PII Detection
-- fixed and updated -project_vision.md

**The Contradiction (Line 254):**
* Original: `"account numbers, names, addresses, and other PII are stripped or replaced with tokens"`

**The Problem:** Perfect PII detection is impossible. Names can appear in transaction descriptions, addresses in memo fields, and there's always edge cases. Claiming perfect sanitization is dishonest and creates liability.

**Suggested Fix:** Use honest language: "best-effort sanitization" + optional user review before cloud requests.

---

### Issue 27: Extension Removal Was Binary — No Graceful Lifecycle
-- fixed and updated -project_vision.md

**The Contradiction (Line 52):**
* Original: `"An extension must be completely removable without leaving orphaned database tables."`

**The Problem:** Users might want to disable an extension temporarily, or uninstall it but keep their data. The binary "remove everything" approach is too aggressive and doesn't match real user needs.

**Suggested Fix:** Three-tier lifecycle: Disable (off, keeps files), Uninstall (removes files, keeps data), Delete Data (permanent, requires confirmation).

---

### Issue 28: DAO API Was Over-Engineered for First Release
-- fixed and updated -project_vision.md

**The Contradiction (Lines 144-168):**
* Original: `finance.extensions.budget.db.budget_items.find()`

**The Problem:** Auto-generating typed, schema-bound DAOs from manifest declarations is complex engineering. For a first release, a simpler `finance.db.table('items')` approach is sufficient. Typed DAOs can be added later.

**Suggested Fix:** Simplify to `finance.db.table('budget_items')` or `finance.db.repository('budget_items')`. Note that typed DAO generation is a future enhancement.

---

### Issue 29: No Extension Marketplace in Roadmap
-- fixed and updated -project_vision.md

**The Problem:** The Long-Term Vision says "Users should be able to install new capabilities exactly like installing extensions in VS Code." But the roadmap stops at Phase 10 (Advanced AI) with no mention of how extensions are packaged, discovered, or distributed.

**Suggested Fix:** Add Phase 11: Extension Ecosystem — packaging, marketplace, digital signing, version management, dependency resolution, automatic updates.

---

### Issue 30: System Architecture Diagram Showed Only Two Layers
-- fixed and updated -project_vision.md

**The Contradiction (Lines 80-97):**
* Original diagram showed: Core Platform → Extension Host

**The Problem:** With the addition of Shared Financial Data as a third layer, the architecture diagram was outdated. The canonical representation of the platform should show all three layers.

**Suggested Fix:** Replace with three-layer diagram: Core Infrastructure → Shared Financial Data → Extensions.

---

### Issue 31: Missing Development/Production Technology Stack Specifications
-- fixed and updated -project_vision.md

**The Problem:** The technology stack list in the project vision was too high-level, listing only basic dependencies like "TypeScript, HTML, CSS", "Electron", "Node.js", and "SQLite". It missed critical architectural and packaging choices required for a secure, modular, production-ready desktop app:
1. Frontend build tooling (e.g., Vite/Webpack/Esbuild).
2. UI rendering libraries/toolkits (e.g., Lit, VS Code Webview UI Toolkit).
3. Secure IPC details (e.g., `contextBridge`, preload scripts).
4. SQLite driver choice (e.g., `better-sqlite3` for performance).
5. Validation framework (e.g., Zod/Ajv).
6. Packaging/Signing tools (e.g., `electron-builder`/`electron-forge`).
7. Testing runner and E2E tools (e.g., Vitest, Playwright).

**Suggested Fix:** Expand the `# Technology Stack` section in `project_vision.md` to define these concrete libraries and architecture-level choices.

---

## Summary

The document is exceptionally well-structured and perfectly captures the VS Code aesthetic. However, locking down these 31 specific contradictions and security/privacy flaws will elevate it from a beautiful vision to a production-ready technical contract.

**Highest Priority Issues (Original):**
1. **Issue 1 & 3 (Database Security):** Critical - Raw SQL access violates the very security promises made elsewhere.
2. **Issue 5 & 10 (AI Privacy):** Critical - Cloud AI providers contradict the "Local First" and "Privacy Focused" core principles.
3. **Issue 9 (Extension Independence):** Critical - Inter-extension commands break the "Removability" and "Do Not Break Other Extensions" rules.

**Medium Priority Issues (Original):**
4. **Issue 4 (Settings Conflict):** Important - Unclear ownership boundaries.
5. **Issue 6 (Workspace Rigidity):** UX limitation - Kills split-screen potential.
6. **Issue 8 (PostgreSQL Bridge):** Architectural - Future-proofing concern.

**Low Priority Issues (Original):**
7. **Issue 2 (Project Name):** Cosmetic - Inconsistent branding.
8. **Issue 7 (Typo):** Cosmetic - "Performance Security" should be renamed.

**Follow-Up Issues:**
9. **Issue 11 (Activity Bar wording):** Fixed.
10. **Issue 12 (Table naming):** Fixed.
11. **Issue 13 (Phase scope):** Fixed.
12. **Issue 14 (Startup claim):** Fixed.
13. **Issue 15 (Keyboard definition):** Fixed.

**Third-Pass Issues:**
14. **Issue 16 (AI provider names):** Deferred.
15. **Issue 17 (Typo "Deductions"):** Fixed.
16. **Issue 18 (Cash Flow missing):** Fixed.
17. **Issue 19 (DB placeholder name):** Deferred.
18. **Issue 20 (WebviewPanel windows):** Fixed.
19. **Issue 21 (Review count):** Fixed.

**Architectural Issues (Latest):**
20. **Issue 22 (Local First contradiction):** Fixed.
21. **Issue 23 (Missing shared data layer):** Fixed.
22. **Issue 24 (Dashboard ownership):** Fixed.
23. **Issue 25 (AI financial intelligence):** Fixed.
24. **Issue 26 (Privacy overpromise):** Fixed.
25. **Issue 27 (Extension lifecycle):** Fixed.
26. **Issue 28 (DAO over-engineering):** Fixed.
27. **Issue 29 (Missing marketplace roadmap):** Fixed.
28. **Issue 30 (Outdated architecture diagram):** Fixed.
29. **Issue 31 (Missing technology stack specifications):** Fixed.

---

## Appendix: Comparison with VS Code's Actual Technology Stack

To ensure that the recommended technology stack aligns with the core inspiration of this project, here is a mapping and rationale comparing the selected choices with VS Code's actual production architecture:

| Component | Our Recommended Stack | VS Code's Actual Stack | Architectural Rationale for Our Selection |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **Lit** / **`@vscode/webview-ui-toolkit`** | Vanilla Web Components / FAST Web Components | Writing raw Web Components with vanilla JavaScript is highly verbose. Lit provides a standard-compliant, lightweight helper wrapper, and the Webview UI Toolkit provides native VS Code design keys. |
| **Process Isolation** | `contextBridge` + Preload scripts (Node integration disabled) | `contextBridge` + Preload scripts (Node integration disabled) | Identical security implementation. Prevents Webview / Renderer compromise from gaining arbitrary OS code execution. |
| **Extension Host** | Isolated Node.js child processes | Isolated Node.js child processes | Identical performance and crash isolation. Ensures heavy computation in extensions does not block UI responsiveness. |
| **Database & Storage** | **SQLite** (via `better-sqlite3`) | JSON Files + SQLite (workspace state cache) | VS Code manages light UI states, whereas a personal finance workspace requires relational transaction ledgers. `better-sqlite3` is chosen for its superior synchronous performance. |
| **Build & Bundling** | **Vite** / **Esbuild** | Custom Gulp / Esbuild build scripts | Rather than maintaining legacy or complex custom Gulp build pipelines, Vite offers an out-of-the-box, modern, fast builder for renderers. |
| **Validation** | **Zod** & **Ajv** | Custom JSON parser + JSON Schema validation | Ajv provides standard, fast JSON Schema validation for manifests, while Zod brings typed runtime safety for modern TypeScript developer experience. |
| **Testing** | **Vitest** + **Playwright** | Custom Mocha + Smoke test runner | Playwright is developed by Microsoft and includes native API automation for Electron, offering a modern, supported testing framework. |

