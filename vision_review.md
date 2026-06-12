# Project Vision Review Report

**Date:** 2026-06-13
**Reviewed Documents:** `AGENTS.md`, `project_vision.md`
**Reviewer:** opencode (Model: MiniMax-M3)
**Status:** Review Complete - 15 Issues Identified (10 original + 5 follow-up)

---

## 1. Review of `AGENTS.md`

`AGENTS.md` is concise and correctly outlines the behavioral rules. It has no internal contradictions. It functions as the behavioral contract (the "how" of working), which complements the architectural vision document (the "what").

---

## 2. Review of `project_vision.md`

The document is exceptionally well-structured and perfectly captures the VS Code aesthetic. However, a detailed review revealed 10 areas of inconsistency, missing detail, and technical non-sense that should be addressed before this becomes a hard technical reference.

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

## Summary

The document is exceptionally well-structured and perfectly captures the VS Code aesthetic. However, locking down these 15 specific contradictions and security/privacy flaws will elevate it from a beautiful vision to a production-ready technical contract.

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

**Follow-Up Issues (New):**
9. **Issue 11 (Activity Bar wording):** Minor - Inconsistent with multi-tab workspace.
10. **Issue 12 (Table naming):** Low - Rule vs example mismatch.
11. **Issue 13 (Phase scope):** Medium - Vague roadmap phasing.
12. **Issue 14 (Startup claim):** Medium - Unrealistic promise.
13. **Issue 15 (Keyboard definition):** Low - Undefined feature claim.
