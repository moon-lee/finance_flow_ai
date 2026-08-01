import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/ai-panel';
import './components/command-palette';
import type { ActivityView } from './components/activity-bar';
import type { PaletteCommand } from './components/command-palette';
import type { HostLogEntry, HostStatus } from '../types/finance-shell';
import type { NavigationPanel } from './components/navigation-panel';

const app = document.querySelector<HTMLElement>('#app');
const commandPalette = document.querySelector<HTMLElement & { focusInput(): void; extensionCommands: PaletteCommand[] }>('#command-palette');
const navigationPanel = document.querySelector<NavigationPanel>('#navigation-panel');
const activityBar = document.querySelector<HTMLElement & { views: ActivityView[]; activeView: string }>('#activity-bar');

/** Maps viewId → extensionId so nav panel can filter by active extension. */
const viewToExtension = new Map<string, string>();

// [Fix] Mirror Host stdout (and extension `console.log` calls) into the
// DevTools console. Without this, extension logs only appear in the main
// process terminal because the Host runs in a separate utility process.
// Test Unit 4 expects the extension's handler output to be visible to the
// manual tester in DevTools. Subscribing here (top-level, not gated on
// `DOMContentLoaded`) ensures early Host startup logs are captured too.
if (window.financeShell?.extensions?.onHostLog) {
  window.financeShell.extensions.onHostLog((entry: HostLogEntry) => {
    const tag = `[host ${entry.level}]`;
    // Use the matching console method so severity styling + DevTools
    // filtering works correctly. `entry.args` are already stringified on
    // the Host side (see `src/extension-host/host.ts`), so passing them
    // through as a single spread preserves any spacing the original
    // `console.log('a', 'b')` call intended.
    if (entry.level === 'error') console.error(tag, ...entry.args);
    else if (entry.level === 'warn') console.warn(tag, ...entry.args);
    else console.log(tag, ...entry.args);
  });
}

if (window.financeShell?.extensions?.onUiEventFromPanel) {
  window.financeShell.extensions.onUiEventFromPanel((payload: { extensionId: string; eventName: string; detail: unknown }) => {
    const { extensionId, eventName, detail } = payload;
    const mount = document.querySelector(`[data-ext-root][data-extension-id="${extensionId}"][data-view-id]`) as HTMLElement | null;
    if (mount) {
      mount.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true, composed: true }));
    }
  });
}

// [Fix] Mirror Host lifecycle status into the DevTools console. Test Unit 5
// step 6 expects the `extensions:host-status` notification to be observable
// in DevTools after killing the Host (the 'crashed' status). Subscribing
// here at the top level ensures the crash notification is captured even if
// it fires before `DOMContentLoaded`. The Phase 4+ status-bar UI will
// consume the same notification through this bridge.
if (window.financeShell?.extensions?.onHostStatus) {
  window.financeShell.extensions.onHostStatus((status: HostStatus) => {
    const tag = '[host status]';
    // Use the severity of the status to pick the console method so DevTools
    // filtering and styling work correctly. `crashed` and `restart-failed`
    // are operational warnings; `starting`, `ready`, `restarting` are
    // informational.
    if (status.status === 'crashed' || status.status === 'restart-failed') {
      console.error(tag, status);
    } else {
      console.log(tag, status);
    }
  });
}

function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible) commandPalette?.focusInput();
}

// Phase 5 Task 12 — workspace integration. The WebviewPanel system lives in
// Main; the renderer only manages the layout tree and forwards resize/focus
// events to Main via the preload bridge.
/* window.addEventListener('workspace:focus-panel', (event: Event) => {
  const customEvent = event as CustomEvent<{ panelId: string }>;
  window.financeShell?.extensions?.panel?.focus?.(customEvent.detail.panelId);
});
 */
window.addEventListener('workspace:resize', (event: Event) => {
  const customEvent = event as CustomEvent<{ panelId: string; bounds: { x: number; y: number; width: number; height: number } }>;
  window.financeShell?.extensions?.panel?.resize?.(customEvent.detail.panelId, customEvent.detail.bounds);
});

// Phase 4 Task 14.5 — mount an extension's UI element into the workspace
// when Main forwards a UI-mount request. The extension (running in the
// Host) has no DOM, so the Renderer performs the actual mount here.
// Phase 5 replaces this with WebContentsView-based panels; the handler
// remains as a no-op fallback for any legacy callers.

function toggleAiPanel(): void {
  app?.classList.toggle('ai-collapsed');
  void window.financeShell?.settings.set('core.ui.aiCollapsed', app?.classList.contains('ai-collapsed'));
}

async function applyTheme(theme: unknown): Promise<void> {
  if (theme === 'light') document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
}

async function toggleTheme(): Promise<void> {
  const isLight = document.body.classList.toggle('light-theme');
  await window.financeShell?.settings.set('core.theme', isLight ? 'light' : 'dark');
}

async function loadExtensionContributions(): Promise<void> {
  try {
    const contributions = await window.financeShell?.extensions.list();
    if (!contributions) return;
    if (activityBar) {
      activityBar.views = contributions.views.map((v) => {
        viewToExtension.set(v.view.id, v.extensionId);
        return { id: v.view.id, name: v.view.name, icon: v.view.icon };
      });
    }
    if (commandPalette) {
      commandPalette.extensionCommands = contributions.commands.map((c) => ({
        id: c.command.id,
        label: c.command.title,
        extensionCommand: true,
        keybinding: c.command.keybinding
      }));
    }
    if (navigationPanel) {
      navigationPanel.setNavigation((contributions.navigation ?? []).map(n => ({
        extensionId: n.extensionId,
        id: n.navigation.id,
        label: n.navigation.label,
        command: n.navigation.command,
        group: n.navigation.group
      })));
    }
  } catch (err) {
    console.error('Failed to load extension contributions:', err);
  }
}

window.addEventListener('click', (event) => {
  if (commandPalette && !commandPalette.classList.contains('hidden')) {
    const path = event.composedPath();
    if (!path.includes(commandPalette)) setCommandPaletteVisible(false);
  }
});

window.addEventListener('view-changed', (event: Event) => {
  const customEvent = event as CustomEvent<{ view: string; source: string }>;
  // Keep the Activity Bar launcher button highlighted for the active view,
  // whether the view was opened from the bar itself or from the Explorer.
  if (activityBar) activityBar.activeView = customEvent.detail.view;
  if (navigationPanel) navigationPanel.setView(customEvent.detail.view, viewToExtension.get(customEvent.detail.view) ?? '');
  // Ask Main to activate the extension behind this view (no-op for built-in settings view).
  // Duplicate-click suppression is enforced at the Host layer (see
  // `src/extension-host/host.ts#activateExtension` — `if (ext.moduleUrl) return true`),
  // not here: an earlier renderer-side idempotency guard on `lastDispatchedView`
  // incorrectly blocked the re-spawn path (Test Unit 5: killing the Host and then
  // clicking the same view did not re-spawn because the guard short-circuited the
  // call). The Host's module-level guard is the correct layer — it survives renderer
  // resets and correctly handles the 'Host is dead, needs re-spawn' case via
  // `ExtensionIPC.ensureRunning()`.
  if (customEvent.detail.view !== '__settings__' && customEvent.detail.source === 'extension') {
    void window.financeShell?.extensions.activateView(customEvent.detail.view);
  }
});

window.addEventListener('command-selected', (event: Event) => {
  const customEvent = event as CustomEvent<{ command: string; extensionCommand: boolean }>;
  const cmd = customEvent.detail.command;
  if (customEvent.detail.extensionCommand) {
    // [Review fix §4.6] Forward to the Main-side IPC handler instead of just
    // logging. The Main handler delegates to the Extension Host, which calls
    // the extension's registered command handler via `finance.commands.execute()`.
    // Phase 5 will add a per-extension command allowlist here; see Self-Review
    // §7 Security deferral note.
    window.financeShell?.extensions.executeCommand(cmd).then((result) => {
      if (!result.executed) {
        console.warn(`[palette] extension command "${cmd}" did not execute: ${result.reason ?? 'unknown reason'}`);
      }
    }).catch((err) => {
      console.error(`[palette] extension command "${cmd}" threw:`, err);
    });
  } else {
    if (cmd === 'toggle-ai') toggleAiPanel();
    else if (cmd === 'view-dashboard') navigationPanel?.setView('Dashboard');
  }
  setCommandPaletteVisible(false);
});

window.addEventListener('DOMContentLoaded', async () => {
  const version = await window.financeShell?.getVersion() ?? 'dev-browser';

  const theme = await window.financeShell?.settings.get('core.theme');
  if (theme !== undefined) await applyTheme(theme);

  const aiCollapsed = await window.financeShell?.settings.get('core.ui.aiCollapsed');
  if (aiCollapsed === true) app?.classList.add('ai-collapsed');

  await loadExtensionContributions();

  // Dashboard activates on startup (onStartup: true), so filter nav to
  // dashboard items from the start.  The first view in contributions is
  // always dashboard (loaded first in the extensions list).
  if (navigationPanel && viewToExtension.size > 0) {
    const firstViewId = activityBar?.views?.[0]?.id ?? '';
    const firstExtId = viewToExtension.get(firstViewId) ?? '';
    if (firstViewId && firstExtId) {
      navigationPanel.setView(firstViewId, firstExtId);
    }
  }

  const statusBar = document.querySelector('#status-bar');
  if (statusBar) {
    const themeBtn = document.createElement('span');
    themeBtn.className = 'status-item status-btn';
    themeBtn.dataset.action = 'toggle-theme';
    themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    themeBtn.addEventListener('click', async () => {
      await toggleTheme();
      themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    });
    statusBar.appendChild(themeBtn);

    const versionTag = document.createElement('span');
    versionTag.className = 'status-item version-tag';
    versionTag.textContent = `v${version}`;
    statusBar.appendChild(versionTag);
  }
});

window.addEventListener('keydown', (event) => {
  const commandKey = event.ctrlKey || event.metaKey;

  if (commandKey && event.shiftKey && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    setCommandPaletteVisible(commandPalette?.classList.contains('hidden') ?? true);
  }

  if (commandKey && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    toggleAiPanel();
  }

  // Extension command shortcuts (Decision 17, bound per user request).
  // Ctrl+Alt+H → Pay History, Ctrl+Alt+R → Pay Rate History.
  if (commandKey && event.altKey && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    executeExtensionCommand('salary.show-pay-history');
  }
  if (commandKey && event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    executeExtensionCommand('salary.show-pay-rate-history');
  }

  if (event.key === 'Escape') setCommandPaletteVisible(false);
});

/** Forwards an extension command id to Main via the same path as palette selection. */
function executeExtensionCommand(commandId: string): void {
  window.financeShell?.extensions
    .executeCommand(commandId)
    .then((result) => {
      if (result && !result.executed) {
        console.warn(`[shortcut] extension command "${commandId}" did not execute: ${result.reason ?? 'unknown reason'}`);
      }
    })
    .catch((err) => console.error(`[shortcut] extension command "${commandId}" threw:`, err));
  setCommandPaletteVisible(false);
}
