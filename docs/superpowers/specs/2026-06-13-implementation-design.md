---
title: Finance Flow AI - Implementation Design
date: 2026-06-13
status: draft
---

# Implementation Design

## Architecture Approach

**Vertical Slice Model**: Complete a working financial ledger (Transactions extension) before building other extensions. Each extension owns its private data tables with no cross-extension dependencies initially.

## Implementation Phases (Sequential, Each Delivers Working Software)

### Phase 1: Core Shell Prototype
- Electron scaffold with Activity Bar, Navigation Panel, Workspace tabs, AI Panel
- Mock static layout to validate UI/UX before wiring logic
- **Deliverable**: Bootable Electron app with styled panels and static Command Palette

### Phase 2: Database & Settings Backbone
- SQLite connection with infrastructure tables only (extension registry, migration log, settings)
- Settings service: app-wide preferences, window state, theme
- **Deliverable**: App persisting UI preferences and loading last window state

### Phase 3: Extension Host & IPC Foundation
- Spawn isolated Node.js child process for extensions
- MessagePortMain/IPC communication channel
- Manifest parser reading `package.json` contributions
- **Deliverable**: Extension loader spawning process successfully

### Phase 4: Transactions Extension (Vertical Slice) + Domain Services
- Shared Financial Data schemas: Accounts, Transactions, Categories
- `finance.db.table()` API for typed table access (no raw SQL)
- **Domain Services:** TransactionService for validation/categorization, AccountService for balances
- Extension UI: transaction entry form, ledger list, category management
- **Deliverable**: Fully functional transaction ledger with persistent storage

### Phase 5: WebviewPanels & Multi-Extension UI
- Split-screen support, tab management
- Dashboard extension (aggregator, reads Shared Data via Domain Services)
- Navigation providers for sidebar trees
- **Deliverable**: Multiple tabs with live charts in Dashboard, Domain Services consumed consistently

### Phase 6: AI Assistant (Deferred until Phase 5 Complete)
- Ollama integration (default local only)
- Context building from Shared Financial Data
- Tool registry for extension-registered functions
- **Deliverable**: Chat panel with read-only data queries to local LLM

### Phase 7: Production Polish
- Database migrations, backup/restore, encryption
- Keyboard shortcuts, customizable settings
- Theme system, accessibility
- **Deliverable**: Stable release with backup/export capability

### Phase 8: Extension Ecosystem
- Extension packaging tooling (`finance.d.ts` type definitions)
- Dependency resolution, version management, digital signing
- **Deliverable**: Published extension SDK and installer

## Key Technical Decisions

- **No raw SQL in extensions** - only `finance.db.table('name').find()/insert()/update()` to enforce security boundaries
- **Graceful degradation** - missing extensions return `null`, never throw or crash
- **Shared Data ownership** - Platform layer owns Accounts/Transactions/Categories, extensions have read-only access
- **AI deferred** - no cloud providers until Phase 6; local-first with opt-in only

## Success Criteria

Each phase completes with:
1. Working Electron app that boots without errors
2. TypeScript compiles in strict mode
3. All existing tests pass
4. Deliverable matches specification above