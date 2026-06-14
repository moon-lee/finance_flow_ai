# File Reference

## Phase 1 — Core Shell Prototype

| File | Purpose |
|------|---------|
| `src/main/main.ts` | Electron bootstrap, window creation, IPC handler |
| `src/preload/preload.ts` | Secure `contextBridge` with allowlisted `shell:get-version` |
| `src/types/finance-shell.d.ts` | Window global types for preload API |
| `src/types/finance.d.ts` | Future extension API placeholder |
| `src/renderer/index.html` | Shell layout with 5 regions + command palette |
| `src/renderer/styles/layout.css` | Obsidian dark theme, CSS grid layout |
| `src/renderer/components/activity-bar.ts` | 5-button Activity Bar with view switching |
| `src/renderer/components/navigation-panel.ts` | Context-sensitive sidebar |
| `src/renderer/components/workspace.ts` | Tab bar + placeholder content |
| `src/renderer/components/ai-panel.ts` | Collapsible AI Assistant panel |
| `src/renderer/components/command-palette.ts` | Full keyboard-navigable command palette |
| `src/renderer/index.ts` | Keybindings, IPC version display, event wiring |
| `tests/e2e/renderer-shell.spec.ts` | 6 Playwright smoke tests (optional) |
| `vite.config.ts` | Renderer dev/build config |
| `vite.main.config.ts` | Main process build config |
| `vite.preload.config.ts` | Preload build config |
| `tsconfig.json` | TypeScript strict mode config |
| `eslint.config.js` | ESLint flat config |
| `playwright.config.ts` | Playwright E2E test config |
