# Project Vision

## Tagline

AI-Powered Personal Finance Workspace

---

# Mission

This is a desktop-first personal finance platform inspired by the architecture and user experience of VS Code.

The goal is to create a modular finance workspace where new functionality can be added through extensions without changing the core application.

Unlike traditional finance applications, it treats AI as a first-class feature and extensions as the primary mechanism for growth.

---

# Core Principles

1. **Local First:** Your data is stored on your device, not in the cloud. It belongs to you.
2. **AI First:** AI is integrated deeply into the core platform, not tacked on as an afterthought.
3. **Extension First:** All financial domain logic is implemented via independent extensions. The core platform is lean and generic.
4. **Desktop First:** Built for power users with a fast desktop UI (Electron), featuring a VS Code-inspired command palette, customizable keyboard shortcuts, and fully keyboard-navigable panels, trees, and lists.
5. **Privacy Focused:** Completely private, offline-capable, and secure.
6. **Fast and Lightweight:** Quick shell startup with lazy-loaded extensions. The application shell renders instantly; extensions load on first use, keeping memory and startup time lean.
7. **Single Source of Truth:** Centralized local database managed via strict, schema-validated APIs.

---

# Development Rules

To maintain a secure, robust, and highly modular codebase, the following rules govern all development on this platform:

### 1. Separation of Concerns & Core Control
* **No Finance Logic Inside Core:** The Core Platform must remain completely generic and agnostic of financial business logic. No interest calculators, tax bracket structures, or category managers can be written in Core.
* **Extensions Own the Domain:** All business logic, tax computations, and user features belong strictly within extensions.
* **Keep Core Under Control:** Core should focus solely on lifecycle management, shell rendering, security, IPC routing, and AI orchestration.

### 2. Extension Independence & Safety
* **Build One Extension at a Time:** Focus on fully implementing, testing, and verifying one extension before proceeding to the next milestone.
* **Run Independently:** Every extension must operate in isolation. An extension cannot assume that any other extension is active or installed unless declaratively specified as a peer dependency.
* **Do Not Break Other Extensions:** Extensions may interact with each other *only* through Core-mediated API commands (e.g., `finance.commands.execute('budget.getSummary')`). This communication is strictly **optional and graceful**:
  * If the target extension is not installed, disabled, or has not yet been activated, the Core returns `null` (or a documented fallback value). It never throws, never blocks, and never crashes the calling extension.
  * The calling extension must always handle the `null`/missing-extension case and degrade its UX accordingly.
  * Direct in-process imports, shared global state, and direct database cross-writes between extensions are strictly forbidden.
* **Strict Namespace Isolation (Database & Settings):**
  * Extensions must namespace their database tables (e.g., `budget_items`, `tax_deductions`) — the Core enforces this by routing all DAO calls through the extension's own namespace path (`finance.extensions.budget.db.*`), so cross-extension table access is structurally impossible.
  * One extension must *never* perform write/update queries directly on another extension's tables.
  * Settings keys must be prefixed with the extension ID (e.g., `budget.monthlyLimit`, `tax.bracketConfig`). The Core's Settings Service enforces this at the storage layer, so cross-extension setting access is structurally impossible.
  * Extensions declare their settings schemas (key, type, default, label) in the `contributes.configuration` block of their `package.json`. The Core reads these manifests and renders a generic settings UI for them — Core never hardcodes any domain-specific setting.
* **Removability:** An extension must be completely removable without leaving orphaned database tables or breaking the Core Platform.

### 3. Code Quality & Technical Standards
* **TypeScript Strict Mode:** Both the Core and all extensions must be compiled under strict TypeScript options (`strict: true`). No implicit `any` is allowed.
* **Document Every Public API:** All exposed methods, events, and configuration schemas in the public API contract (`finance.d.ts`) must be extensively documented.
* **Avoid Unnecessary Dependencies:** Prioritize native Node.js APIs and simple, lightweight packages. Avoid heavy libraries that degrade startup performance.

---

# Technology Stack

* **Frontend:** TypeScript, HTML, CSS (using modern, standard-compliant components)
* **Desktop Framework:** Electron
* **Runtime:** Node.js
* **Editor Architecture Inspiration:** VS Code
* **Database:** SQLite
* **AI Providers:**
  * Local (default): Ollama
  * Cloud (opt-in only): OpenAI (opencode, kilocode), Gemini
  * Cloud providers require explicit user opt-in and data is filtered/anonymized before transmission to honor Local First and Privacy Focused principles.
* **Development:** TypeScript Strict Mode, Git, npm

---

# System Architecture

The application is split into two distinct boundaries: the **Core Platform** and **Extensions**.

```
+-------------------------------------------------------------+
|                        Core Platform                        |
|   +-------------------+  +------------------+  +--------+   |
|   | Extension Loader  |  | Database Service |  | AI Svc |   |
|   +---------+---------+  +--------+---------+  +---+----+   |
+-------------|---------------------|----------------|--------+
              | IPC (Secure)        | API                |
+-------------v---------------------v----------------v--------+
|                      Extension Host (Node)                  |
|  +-------------------------------------------------------+  |
|  |                   Extension Runtime                   |  |
|  |  +--------------------+       +--------------------+  |  |
|  |  | Dashboard Ext      |       | Tax Extension      |  |  |
|  |  +--------------------+       +--------------------+  |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

## Core Platform
Responsible for the runtime shell, visual layout, and core system utilities. It contains **no finance business logic**.
* **Application Shell:** Window management, menu bars, and basic rendering.
* **Extension Framework:** Discovering, loading, and managing extension life cycles.
* **Database Access:** SQLite connection, migrations, transactions, and backups.
* **AI Integration:** Communication with LLM providers, chat history, context retrieval, and tool execution.
* **Settings:** Generic, app-wide preferences only (window state, active theme, AI provider keys, database directory). Domain-specific settings (e.g., "Tax Bracket Configuration") are *not* owned by Core; extensions register their own settings schemas in their `package.json` and the Core renders them using a generic UI.
* **Event System:** Global event bus (e.g., database changes, window state changes).
* **Backup System:** Automatic schema-validated JSON/database backups.

---

## Extensions
Responsible for all user features, business rules, financial calculations, and domain-specific workflows.
* **Separation of Concerns:** All finance functionality—from calculations to rendering sheets—belongs inside extensions.
* **Sandboxed Execution:** Extensions operate inside an isolated process and must use the Core API to touch system resources.

---

# VS Code Inspired Extension Architecture

To achieve the exact modularity and reliability of VS Code, our platform adopts a matching extension system.

### 1. The Declarative Manifest (`package.json`)
Every extension defines its metadata and capabilities in a declarative manifest. This allows the Core Platform to register and display the extension's entry points in the UI **without loading or running its JavaScript**, ensuring near-instant application startup.
* **`activationEvents`**: Specifies when the extension's code should be executed. Examples:
  * `onView:dashboard` (loads when the user opens the dashboard)
  * `onCommand:tax.calculate` (loads when a specific command is run)
  * `*` (loads immediately on startup—reserved for core utilities)
* **`contributes`**: Declares visual and behavioral contribution points:
  * `views`: Navigation panel list items and workspace views.
  * `commands`: Operational tasks (e.g., `budget.createCategory`).
  * `menus`: Context menu items, Activity Bar buttons, and top menu shortcuts.
  * `configuration`: Custom user settings that the Core automatically displays in the settings panel.

### 2. Isolated Extension Host Process
Like VS Code, extensions execute inside a separate Node.js background process called the **Extension Host**.
* **System Stability:** Even if an extension is executing a heavy, synchronous calculation (e.g., a 30-year compound interest forecast), the primary UI process remains perfectly smooth and responsive at 60 FPS.
* **Crash Isolation:** If an extension crashes, the core application shell remains alive and running, allowing the user to reload the crashed extension gracefully.

### 3. The Secure Extension API (`finance` namespace)
Extensions do not import SQLite, Electron, or Node's file system directly. Instead, they interact with the host via a strictly defined, secure API based on **Schema-Bound Data Access Objects (DAOs)**. 

Every extension declares its own database tables in its `package.json` manifest. The Core reads the manifest and generates strictly typed, namespaced accessors for the extension. The extension can *only* read from and write to its own declared tables — it is structurally impossible to query another extension's tables or execute raw SQL.

```typescript
import * as finance from 'finance';

// Extension declared these tables in its package.json:
// "tables": ["budget_items", "budget_categories"]

// Query ONLY this extension's tables via typed DAO (Schema-validated, safe)
const items = await finance.extensions.budget.db.budget_items.find({ 
    amount: { $gt: 100 } 
});

// Core auto-generates the SQL internally. 
// The extension CANNOT run DROP TABLE, cannot query other extensions' tables, 
// and cannot send raw SQL — no SQL injection vector exists.

// Register a tool that the Core AI Assistant can invoke
finance.ai.registerTool({
    name: 'calculateTaxEstimate',
    description: 'Calculate income tax estimates based on annual income and deductions',
    handler: async (args) => {
        const { income, deductions } = args;
        return calculateTax(income, deductions);
    }
});
```

### 4. UI Rendering Layer
To allow custom visual experiences while maintaining security and consistency:
* **The Main Workspace (Webviews):** For full-screen dashboards, data grids, and interactive charts, extensions create a secure, sandboxed `WebviewPanel` (using Electron's `iframe` with rigid sandbox constraints). The extension feeds its frontend files (HTML/CSS/JS) to this panel, communicating with its background script via a lightweight, secure bridge (`postMessage`).
* **The Navigation Panel (Declarative UI):** Standard lists, collapsible trees, and side-menus are rendered directly by the Core. The active extension simply supplies a Data Provider (e.g., a list of budget categories) to the Core's Navigation Service. This ensures a beautifully consistent visual design.

---

# Main Application Layout

```
+-----------------------------------------------------------+
| Menu Bar                                                  |
+-----+----------------+------------------+----------------+
|     |                |                  |                |
| A   | Navigation     | Main Workspace   | AI Assistant   |
| C   | Panel          |                  | Panel          |
| T   |                |                  |                |
| I   | (Controlled by | (Controlled by   | (Core Service) |
| V   | active         | active           |                |
| I   | extension)     | extension)       | (Show/Hide)    |
| T   |                |                  |                |
| Y   |                |                  |                |
+-----+----------------+------------------+----------------+
| Status Bar                                               |
+-----------------------------------------------------------+
```

---

# Activity Bar

Positioned on the far left, mirroring VS Code. It displays the icons of active or installed extensions. Clicking an icon sets the active extension context: it opens a new tab in the Main Workspace (or focuses an existing one if already open) and updates the Navigation Panel accordingly. Existing tabs remain open and accessible via the tab bar.

Examples:
* **Dashboard:** Net worth and high-level health metrics.
* **Transactions:** Raw ledger entry and categorization.
* **Budget:** Spending allocations and tracking.
* **Cash Flow:** Monthly trends and future forecasts.
* **Tax:** Deductions, PAYG ledger, and tax estimations.
* **Mortgage:** Loan schedules and refinance models.
* **Property:** Costs, rates, and real estate equity.
* **Super:** Retirement projections and superannuation fees.
* **Reports:** Complex balance sheets, custom exports, and AI-summarized insights.
* **Settings:** App configs, extension manager, theme chooser, and AI providers.

---

# Navigation Panel

Displays a context-specific sidebar controlled by the active extension. It contains interactive trees, lists, and controls.

Examples:
* **Budget Extension Active:**
  * Monthly Budget
  * Categories
  * Targets
  * Alerts
* **Tax Extension Active:**
  * Summary
  * Deductions
  * PAYG Ledger
  * Estimates

---

# Main Workspace

The primary, high-performance canvas where data is displayed and manipulated. It mirrors VS Code's editor model exactly.
* Supports data grids, rich interactive forms, dashboards, charts, and financial reports.
* **Tabs:** Opening a workspace mounts it as a new tab. Users can have many tabs open simultaneously and switch between them via the tab bar.
* **Split-Screen Groups:** Tabs can be dragged into separate editor groups (side-by-side, top-and-bottom, grid layouts), letting the user view two or more extensions concurrently. For example, comparing the Tax summary in one pane against the Budget breakdown in another.
* **Active Context:** The currently focused tab/group drives the Navigation Panel and other contextual UI. Switching tabs cleanly swaps the active context without losing the inactive tabs' state.
* **Webviews:** Extensions can also open their own sandboxed `WebviewPanel` tabs (e.g., a chart view, a detailed form) alongside regular extension tabs within the same editor groups.

---

# AI Assistant Panel

A permanent, collapsible panel on the far right. **The AI Assistant is not an extension; it is a Core Service.**

### Privacy & Data Flow Policy (Default-Deny)
The AI Assistant is the only Core component that talks to external AI providers. To honor the **Local First** and **Privacy Focused** principles, the following rules govern all AI interactions:
* **Default Provider is Local:** Ollama is the default provider. No financial data leaves the user's machine unless the user explicitly opts in.
* **Explicit Opt-In Per Provider:** Cloud providers (OpenAI, Gemini) are off by default. The user must actively enable them in Settings and acknowledge a privacy disclosure.
* **Data Sanitization Layer:** Before any context is sent to a cloud provider, the Core runs a sanitization pass: account numbers, names, addresses, and other PII are stripped or replaced with tokens. Extensions may register additional sanitization rules for their own data.
* **User-Visible Audit Log:** Every cloud AI call is logged locally. The user can inspect what data was sent, to which provider, and why.
* **Read-Only by Default:** The AI Assistant's direct database access is strictly read-only. Any write action (e.g., "create a budget category") must be performed by invoking a tool that the *extension* registered — the AI never writes to the database directly.

### Core Responsibilities
* **Database Querying:** Converts natural language questions into safe, read-only typed DAO calls to fetch financial facts.
* **Trend Analysis:** Identifies irregularities, spending patterns, and opportunities for saving.
* **Narrative Reports:** Explains complex financial reports or annual performance.
* **Action & Tool Execution:** Invokes tools that extensions register (e.g., asking the Budget extension to create a new category, or asking the Tax extension to estimate next year's tax liability). All write operations flow through extension-registered tools, never through the AI directly.
* **Workspace Navigation:** Helps the user navigate the app (e.g., *"Open my mortgage refinance workspace"*).

### User Interaction Examples
* *"Show my spending this year in a pie chart."*
* *"Estimate next year's tax based on my current deductions."*
* *"Summarize my mortgage interest costs over the last 12 months."*
* *"Create a new budget for 2027 with a 15% savings target."*
* *"Find any unusual expenses from last month."*
* *"Compare my spending this month to last month."*

---

# Database Strategy

### Primary Database: SQLite
* **Local:** Stores all application data locally in a single file (`myfinance.db`).
* **Fast & Reliable:** Instantaneous local queries, atomic transactions, and zero external service dependencies.
* **Portable:** Easy to move, clone, or secure.
* **Backup-Friendly:** Trivial automated backup to an encrypted local file or cloud folder.

### Future Capability
* **PostgreSQL Bridge:** Built-in adapter interfaces will support linking to a private PostgreSQL instance for optional self-hosted cloud synchronization.

---

# Data Architecture

The Core owns all SQLite connection and file access. Extensions **never** open a direct connection to the SQLite database. Instead, they interact with strictly generated, schema-bound Data Access Objects (DAOs) that the Core produces from the extension's declared manifest.

```
+-------------------------------------------------------+
|                       Extension                       |
+---------------------------|---------------------------+
                            | Typed DAO Call (e.g. finance.extensions.budget.db.budget_items.find())
+---------------------------v---------------------------+
|                      Finance API                      |
|         (Auto-generated schema-bound accessors)       |
+---------------------------|---------------------------+
                            | Validation, Permissions & SQL Generation
+---------------------------v---------------------------+
|                    Database Service                   |
+---------------------------|---------------------------+
                            | Internal Safe SQL Execution
+---------------------------v---------------------------+
|                        SQLite                         |
+-------------------------------------------------------+
```

### Key Benefits
* **Security:** The Core firewall is structural, not lexical. Extensions physically cannot run `DROP TABLE`, cannot query tables outside their declared schema, and cannot inject raw SQL — the typed DAO simply does not expose those capabilities.
* **Ease of Migration:** Schemas can be migrated centrally by the Core. The extension's typed DAO interface remains stable, so extensions never break during upgrades.
* **Database Portability:** When the future PostgreSQL Bridge (or any other engine) is introduced, only the Core's internal SQL generator changes. Extension code stays exactly the same.
* **Seamless AI Integration:** Since the Core controls the schema catalog and the DAO layer, the AI Assistant can securely inspect table structures and run analytical queries through the same validated, namespaced accessors.

---

# Core Services

## Database Service
* Manages the active connection to `myfinance.db`.
* Reads each extension's declared table manifest and generates strictly typed, schema-bound Data Access Objects (DAOs) for that extension.
* Coordinates database schema updates (migrations) during app updates.
* Internally translates the typed DAO calls into safe, engine-specific SQL.
* Conducts scheduled and user-initiated encrypted database backups.

## AI Service
* Manages keys, endpoints, and requests to AI Providers (OpenAI, Gemini, Ollama).
* Provides context building, chat session history storage, and prompt template management.
* Handles tool resolution: exposes extension-registered tools to the LLM and executes the handlers securely.

## Extension Service
* Scans the system extensions directory.
* Parses declarative `package.json` manifests to build the initial UI and command catalogs.
* Spawns, monitors, and communicates with the background Extension Host process.
* Handles installing, enabling, and disabling extensions safely.

## Settings Service
* Acts as a generic, namespaced Key-Value store. Core owns no schema, no business meaning, and no domain logic.
* Manages truly app-wide preferences: window state, active theme, AI provider API keys, and database directory paths.
* Renders the Settings UI for any settings keys that extensions have registered in their `package.json` (`contributes.configuration` block). The Core displays them using generic, schema-driven form components (text fields, toggles, dropdowns) — it does not know or care what the setting *means*.
* Strictly namespaces all stored keys by extension ID (e.g., `finance.settings.get('budget.monthlyLimit')`) so that no extension can read or write another extension's settings.

---

# Initial Extensions

1. **Dashboard:** Core financial overview displaying Net Worth, monthly summaries, overall savings rate, and global cash positions.
2. **Transactions:** High-speed ledger interface managing incoming, outgoing, and transfer records across categorized accounts.
3. **Budget:** Monthly plan manager enabling users to define envelopes/targets, track categories, and receive over-budget alerts.
4. **Cash Flow:** Advanced cash projection system calculating monthly trends and running interactive, chart-rich future forecasts.
5. **Tax:** Australian/global income tax workbook with PAYG tracking, dynamic refund calculations, and a deduction records ledger.
6. **Mortgage:** Financial loan calculator modeling balance progressions, interest-vs-principal splits, and potential refinance scenarios.
7. **Property:** Asset tracker recording home values, council rates, insurance costs, and overall ownership maintenance expenses.
8. **Super:** Superannuation/401k dashboard tracking employer contributions, fund fees, and retirement value projections.
9. **Reports:** Multi-format document generator outputting clean annual sheets, tax summaries, PDF exports, and AI-written summaries.

---

# Future Extensions

* **Shares & ETFs:** Dynamic stock portfolios, dividend ledgers, and cost basis calculations.
* **Crypto:** Multi-chain token wallets, transaction histories, and cost-basis analysis.
* **SMSF (Self-Managed Super Funds):** Compliance sheets, fund registers, and balance summaries.
* **Rental Properties:** Tenant tracking, rental ledgers, property manager fees, and depreciation logs.
* **Business Accounting:** Sole trader invoicing, GST ledgers, and BAS preparation templates.
* **Insurance:** Policy registers, premium trackers, and coverage evaluations.
* **Financial Goals:** Multi-year goal planners, savings challenge meters, and milestone alerts.
* **Debt Management:** Snowball or avalanche repayment planners and interest optimization models.

---

# Development Roadmap

### Phase 1: Core Platform
* Bootstrapping Electron shell with TypeScript Strict Mode.
* Implementing the structural layout: Activity Bar, Navigation Panel, Workspace, and collapsible AI Panel.
* Building the Command Palette, keyboard shortcut registry, and keyboard-navigable UI (trees, lists, panels).

### Phase 2: Extension Framework
* Creating the Extension Loader and registering the Extension Host process.
* Defining the manifest parsing rules and activation event triggers.
* Standardizing the `finance` API contract.

### Phase 3: Database Layer
* Setting up the SQLite connection, transaction management, and migration runner.
* Establishing infrastructure schemas (extension registry, settings store, migration log) — no finance data.
* Implementing the DAO generator that reads extension table manifests and produces typed accessors.
* Implementing backup and recovery utilities.

### Phase 4: Dashboard Extension
* Implementing net worth calculations, core metrics summaries, and basic dashboard webviews.

### Phase 5: Transactions Extension
* Building high-speed ledger views, category engines, and CSV/bank import adapters.

### Phase 6: Budget Extension
* Implementing allocation schemas, category tracking, and progress visualization.

### Phase 7: Tax Extension
* Deploying PAYG ledgers, Australian tax brackets calculation engines, and deduction ledgers.

### Phase 8: Mortgage Extension
* Designing loan balance calculators, amortization charts, and offset account calculators.

### Phase 9: Reports Extension
* Integrating pdf-export engines and standardizing CSV/JSON output schemas.

### Phase 10: Advanced AI
* Full natural-language query resolution, auto-categorization tools, and automated financial auditing.

---

# Long-Term Vision

This platform should become a personal finance operating system.

Users should be able to install new capabilities exactly like installing extensions in VS Code.

The extension ecosystem is the platform. Finance management is simply the first application suite built on top of that platform.

The AI Assistant acts as the primary interface for interacting with financial data, making professional-grade financial forecasting and strategy accessible to everyone.
