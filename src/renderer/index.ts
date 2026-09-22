import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/command-palette';
import './components/settings-screen';
import './components/accounts-manager';
import './components/shortcuts-screen';
import './components/backup-screen';
import './components/toast-container';
import './components/extension-manager';
import { overlayCoordinator } from './overlay-coordinator';
import { sortActivityViews, type ActivityView } from './components/activity-bar';
import type { PaletteCommand } from './components/command-palette';
import type { HostLogEntry, HostStatus } from '../types/finance-shell';
import type { NavigationPanel } from './components/navigation-panel';
import { rendererLogger } from './logger';
import { formatLine } from '../shared/base-logger';
import { resolveThemeColor } from '../shared/theme-color';
import { buildExtensionIconUrl } from '../shared/extension-icon';

const commandPalette = document.querySelector<HTMLElement & { focusInput(): void; extensionCommands: PaletteCommand[] }>('#command-palette');
const navigationPanel = document.querySelector<NavigationPanel>('#navigation-panel');
const activityBar = document.querySelector<HTMLElement & { views: ActivityView[]; activeView: string }>('#activity-bar');
const workspace = document.querySelector<HTMLElement & { hideTabStrip?: boolean }>('#workspace');

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
    const level = (entry.level === 'log' ? 'info' : entry.level) as 'debug' | 'info' | 'warn' | 'error';
    const line = formatLine({
      level,
      message: entry.message ?? (entry.args ?? []).join(' '),
      context: entry.context ?? `host`,
      error: entry.error,
      timestamp: entry.timestamp ?? Date.now(),
      file: entry.file,
      line: entry.line,
    });
    // Use the matching console method so severity styling + DevTools
    // filtering works correctly.
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else if (level === 'info') console.info(line);
    else console.debug(line);
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
    if (status.status === 'crashed' || status.status === 'restart-failed') {
      console.error(tag, status);
    } else {
      console.log(tag, status);
    }
  });
}

if (window.financeShell?.events?.on) {
  window.financeShell.events.on('settings.changed', (payload: unknown) => {
    const key = (payload as { key?: unknown })?.key;
    if (typeof key !== 'string') return;
    if (key.endsWith('.themeColor')) {
      void loadExtensionContributions();
      void (workspace as HTMLElement & { refreshThemeColors?: () => Promise<void> })?.refreshThemeColors?.();
      return;
    }
  });
  window.financeShell.events.on('log.level-changed', (payload: unknown) => {
    const level = (payload as { level?: unknown })?.level;
    if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
      rendererLogger.setMinLevel(level);
    }
  });
  ['error', 'warn', 'info', 'debug'].forEach((level) => {
    window.financeShell.events.on(`log.${level}`, (payload: unknown) => {
      const p = payload as { level: 'debug' | 'info' | 'warn' | 'error'; message?: string; context?: string; error?: string; timestamp?: number; file?: string; line?: number };
      const line = formatLine({
        level: (p.level ?? level) as 'debug' | 'info' | 'warn' | 'error',
        message: p.message ?? '',
        context: p.context ?? 'renderer',
        error: p.error,
        timestamp: p.timestamp ?? Date.now(),
        file: p.file,
        line: p.line,
      });
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else if (level === 'info') console.info(line);
      else console.debug(line);
    });
  });
}

function setCommandPaletteVisible(visible: boolean): void {
  const currentlyVisible = !(commandPalette?.classList.contains('hidden') ?? true);
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible && !currentlyVisible) overlayCoordinator.showOverlay('command-palette');
  else if (!visible && currentlyVisible) overlayCoordinator.hideOverlay('command-palette');
  if (visible) {
    requestAnimationFrame(() => commandPalette?.focusInput());
  }
}

// Phase 5 Task 12 — workspace integration. The WebviewPanel system lives in
// Main; the renderer only manages the layout tree and forwards resize/focus
// events to Main via the preload bridge.
/* window.addEventListener('workspace:focus-panel', (event: Event) => {
  const customEvent = event as CustomEvent<{ panelId: string }>;
  window.financeShell?.panel?.focus?.(customEvent.detail.panelId);
});
*/
window.addEventListener('workspace:resize', (event: Event) => {
  const customEvent = event as CustomEvent<{ panelId: string; bounds: { x: number; y: number; width: number; height: number } }>;
  window.financeShell?.panel?.resize?.(customEvent.detail.panelId, customEvent.detail.bounds);
});

// Phase 4 Task 14.5 — mount an extension's UI element into the workspace
// when Main forwards a UI-mount request. The extension (running in the
// Host) has no DOM, so the Renderer performs the actual mount here.
// Phase 5 replaces this with WebContentsView-based panels; the handler
// remains as a no-op fallback for any legacy callers.

async function applyTheme(theme: unknown): Promise<void> {
  if (theme === 'light') document.body.classList.add('light-theme');
  else document.body.classList.remove('light-theme');
}

async function toggleTheme(): Promise<void> {
  const isLight = document.body.classList.toggle('light-theme');
  await window.financeShell?.settings.set('core.theme', isLight ? 'light' : 'dark');
  window.financeShell?.panel?.broadcastTheme?.(isLight ? 'light' : 'dark');
}

export function extensionIconUrl(extensionId: string, icon: string): string | undefined {
  return buildExtensionIconUrl(extensionId, icon);
}

async function loadExtensionContributions(): Promise<void> {
  try {
    const contributions = await window.financeShell?.extensions.list();
    if (!contributions) return;
    if (activityBar) {
      const built = await Promise.all(contributions.views.map(async (v) => {
        viewToExtension.set(v.view.id, v.extensionId);
        let setting: unknown;
        try {
          setting = await window.financeShell?.settings?.get?.(`${v.extensionId}.themeColor`);
        } catch {
          setting = undefined;
        }
        const color = resolveThemeColor({
          setting,
          manifest: contributions.themeColors?.[v.extensionId] ?? undefined,
          report: (message, value) => rendererLogger.warn(`${message}:`, value as string),
        });
        const iconUrl = extensionIconUrl(v.extensionId, v.view.icon);
        return { id: v.view.id, name: v.view.name, icon: v.view.icon, iconUrl, color };
      }));
      let savedOrder: unknown;
      try {
        savedOrder = await window.financeShell?.settings?.get?.('core.activityBar.order');
      } catch {
        savedOrder = undefined;
      }
      activityBar.views = sortActivityViews(built, savedOrder);
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
    wireActivityReorder();
  } catch (err) {
    rendererLogger.error('Failed to load extension contributions:', err);
  }
}

let activityReorderWired = false;

function currentActivityIds(): string[] {
  return (activityBar?.views ?? []).map((v) => v.id);
}

async function persistActivityOrder(): Promise<void> {
  try {
    await window.financeShell?.settings?.set?.('core.activityBar.order', currentActivityIds());
  } catch (err) {
    rendererLogger.warn('Failed to persist activity bar order:', err as string);
  }
}

function reorderActivityViews(fromId: string, toId: string, after: boolean): void {
  if (!activityBar || fromId === toId) return;
  const views = activityBar.views.slice();
  const from = views.findIndex((v) => v.id === fromId);
  const to = views.findIndex((v) => v.id === toId);
  if (from === -1 || to === -1) return;
  const [moved] = views.splice(from, 1);
  const target = views.findIndex((v) => v.id === toId);
  views.splice(after ? target + 1 : target, 0, moved);
  activityBar.views = views;
  void persistActivityOrder();
}

function moveActivityView(viewId: string, dir: -1 | 1): void {
  if (!activityBar) return;
  const views = activityBar.views.slice();
  const i = views.findIndex((v) => v.id === viewId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= views.length) return;
  [views[i], views[j]] = [views[j], views[i]];
  activityBar.views = views;
  void persistActivityOrder();
}

function wireActivityReorder(): void {
  if (activityReorderWired || !activityBar) return;
  activityReorderWired = true;
  activityBar.addEventListener('activity-reorder', (e: Event) => {
    const d = (e as CustomEvent).detail as { fromViewId: string; toViewId: string; after: boolean };
    reorderActivityViews(d.fromViewId, d.toViewId, d.after);
  });
  activityBar.addEventListener('activity-move', (e: Event) => {
    const d = (e as CustomEvent).detail as { viewId: string; dir: -1 | 1 };
    moveActivityView(d.viewId, d.dir);
  });
}

window.addEventListener('click', (event) => {
  if (commandPalette && !commandPalette.classList.contains('hidden')) {
    const path = event.composedPath();
    if (!path.includes(commandPalette)) setCommandPaletteVisible(false);
  }
});

window.addEventListener('view-changed', (event: Event) => {
  const customEvent = event as CustomEvent<{ view: string; source: string }>;
  const viewId = customEvent.detail.view;
  const src = customEvent.detail.source || 'renderer';
  rendererLogger.log(`view-changed event: viewId=${viewId}`, src);
  
  if (viewId === '__settings__' || viewId === '__accounts__' || viewId === '__shortcuts__' || viewId === '__backup__' || viewId === '__extensions__') {
    if (activityBar) activityBar.activeView = viewId;
    if (navigationPanel) navigationPanel.setView(viewId);
    
    const settingsScreen = document.querySelector('settings-screen');
    if (settingsScreen) settingsScreen.remove();
    const accountsManager = document.querySelector('accounts-manager');
    if (accountsManager) accountsManager.remove();
    const shortcutsScreen = document.querySelector('shortcuts-screen');
    if (shortcutsScreen) shortcutsScreen.remove();
    const backupScreen = document.querySelector('backup-screen');
    if (backupScreen) backupScreen.remove();
    const extensionManager = document.querySelector('extension-manager');
    if (extensionManager) extensionManager.remove();
    
    if (viewId === '__settings__') {
      const existing = workspace?.querySelector('settings-screen');
      if (!existing) {
        const screen = document.createElement('settings-screen');
        workspace?.appendChild(screen);
      }
      if (workspace) workspace.hideTabStrip = true;
      overlayCoordinator.hideOverlay('accounts');
      overlayCoordinator.hideOverlay('shortcuts');
      overlayCoordinator.hideOverlay('backup');
      overlayCoordinator.hideOverlay('extensions');
      overlayCoordinator.showOverlay('settings');
    } else if (viewId === '__accounts__') {
      const existing = workspace?.querySelector('accounts-manager');
      if (!existing) {
        const screen = document.createElement('accounts-manager');
        workspace?.appendChild(screen);
      }
      if (workspace) workspace.hideTabStrip = true;
      overlayCoordinator.hideOverlay('settings');
      overlayCoordinator.hideOverlay('shortcuts');
      overlayCoordinator.hideOverlay('backup');
      overlayCoordinator.hideOverlay('extensions');
      overlayCoordinator.showOverlay('accounts');
    } else if (viewId === '__shortcuts__') {
      const existing = workspace?.querySelector('shortcuts-screen');
      if (!existing) {
        const screen = document.createElement('shortcuts-screen');
        workspace?.appendChild(screen);
      }
      if (workspace) workspace.hideTabStrip = true;
      overlayCoordinator.hideOverlay('settings');
      overlayCoordinator.hideOverlay('accounts');
      overlayCoordinator.hideOverlay('backup');
      overlayCoordinator.hideOverlay('extensions');
      overlayCoordinator.showOverlay('shortcuts');
    } else if (viewId === '__backup__') {
      const existing = workspace?.querySelector('backup-screen');
      if (!existing) {
        const screen = document.createElement('backup-screen');
        workspace?.appendChild(screen);
      }
      if (workspace) workspace.hideTabStrip = true;
      overlayCoordinator.hideOverlay('settings');
      overlayCoordinator.hideOverlay('accounts');
      overlayCoordinator.hideOverlay('shortcuts');
      overlayCoordinator.hideOverlay('extensions');
      overlayCoordinator.showOverlay('backup');
    } else if (viewId === '__extensions__') {
      const existing = workspace?.querySelector('extension-manager');
      if (!existing) {
        const screen = document.createElement('extension-manager');
        workspace?.appendChild(screen);
      }
      if (workspace) workspace.hideTabStrip = true;
      overlayCoordinator.hideOverlay('settings');
      overlayCoordinator.hideOverlay('accounts');
      overlayCoordinator.hideOverlay('shortcuts');
      overlayCoordinator.hideOverlay('backup');
      overlayCoordinator.showOverlay('extensions');
    }
    return;
  }

  const settingsScreen = document.querySelector('settings-screen');
  if (settingsScreen) settingsScreen.remove();
  const accountsManager = document.querySelector('accounts-manager');
  if (accountsManager) accountsManager.remove();
  const shortcutsScreen = document.querySelector('shortcuts-screen');
  if (shortcutsScreen) shortcutsScreen.remove();
  const backupScreen = document.querySelector('backup-screen');
  if (backupScreen) backupScreen.remove();
  const extensionManager2 = document.querySelector('extension-manager');
  if (extensionManager2) extensionManager2.remove();
  if (workspace) workspace.hideTabStrip = false;
  
  overlayCoordinator.hideOverlay('settings');
  overlayCoordinator.hideOverlay('accounts');
  overlayCoordinator.hideOverlay('shortcuts');
  overlayCoordinator.hideOverlay('backup');
  overlayCoordinator.hideOverlay('extensions');
  
  const extId = viewToExtension.get(viewId);
  if (!extId) {
    window.financeShell?.panel?.list?.().then((panels) => {
      const match = panels?.find((p) => p.viewId === viewId);
      if (match?.extensionId) {
        const primaryView = activityBar?.views?.find((v) => viewToExtension.get(v.id) === match.extensionId);
        if (activityBar) activityBar.activeView = primaryView?.id ?? '';
        if (navigationPanel) navigationPanel.setView(viewId, match.extensionId);
      }
    });
  } else {
    if (activityBar) activityBar.activeView = viewId;
    if (navigationPanel) navigationPanel.setView(viewId, extId);
  }
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
        rendererLogger.warn(`extension command "${cmd}" did not execute: ${result.reason ?? 'unknown reason'}`, 'palette');
      }
    }).catch((err) => {
      rendererLogger.error(`extension command "${cmd}" threw`, 'palette', err as Error);
    });
  } else {
    if (cmd === 'view-dashboard') navigationPanel?.setView('Dashboard');
  }
  setCommandPaletteVisible(false);
});

async function initApp(): Promise<void> {
  const version = await window.financeShell?.getVersion() ?? 'dev-browser';

  const theme = await window.financeShell?.settings.get('core.theme');
  if (theme !== undefined) await applyTheme(theme);



  await loadExtensionContributions();

  if (navigationPanel && viewToExtension.size > 0) {
    const firstViewId = activityBar?.views?.[0]?.id ?? '';
    const firstExtId = viewToExtension.get(firstViewId) ?? '';
    if (firstViewId && firstExtId) {
      navigationPanel.setView(firstViewId, firstExtId);
    }
  }

  if (navigationPanel && viewToExtension.size === 0) {
    try {
      const { count } = await window.financeShell?.accounts?.count?.() ?? { count: 0 };
      if (count === 0) {
        navigationPanel.setView('__accounts__');
        const accountsScreen = document.createElement('accounts-manager');
        workspace?.appendChild(accountsScreen);
        if (workspace) workspace.hideTabStrip = true;
        overlayCoordinator.showOverlay('accounts');
        if (activityBar) activityBar.activeView = '__settings__';
      }
    } catch {
      // ignore — fall back to default empty state
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

    const spacer = document.createElement('span');
    spacer.className = 'status-spacer';
    statusBar.appendChild(spacer);

    const errorStatus = document.createElement('span');
    errorStatus.className = 'status-item status-error';
    errorStatus.style.display = 'none';
    errorStatus.title = 'Dismissed errors';
    errorStatus.addEventListener('click', () => {
      const toastContainer = document.querySelector('toast-container');
      if (toastContainer) {
        toastContainer.clearErrorStatus();
      }
      errorStatus.style.display = 'none';
    });
    statusBar.appendChild(errorStatus);

    const versionTag = document.createElement('span');
    versionTag.className = 'status-item version-tag';
    versionTag.textContent = `v${version}`;
    statusBar.appendChild(versionTag);

    document.addEventListener('error-status-changed', (event: Event) => {
      const customEvent = event as CustomEvent<{ count: number; type: 'info' | 'warning' | 'error' | null; message: string | null }>;
      const count = customEvent.detail.count;
      const type = customEvent.detail.type;
      const message = customEvent.detail.message;
      if (count === 0) {
        errorStatus.style.display = 'none';
        errorStatus.textContent = '';
      } else {
        errorStatus.style.display = '';
        errorStatus.className = `status-item status-${type ?? 'error'}`;
        errorStatus.textContent = count === 1 ? message ?? 'Notification' : `${count} notifications`;
      }
    });
  }

  const existingToast = document.querySelector('toast-container');
  if (!existingToast) {
    document.body.appendChild(document.createElement('toast-container'));
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Phase 7 Task 4 — receive shortcut matches from Main so they work from
// WebContentsView panels as well as the main renderer.
if (window.financeShell?.extensions?.onShortcut) {
  window.financeShell.extensions.onShortcut((payload) => {
    const { commandId } = payload;
    switch (commandId) {
      case 'core.toggle-command-palette':
        setCommandPaletteVisible(commandPalette?.classList.contains('hidden') ?? true);
        break;
      case 'core.close-palette':
        setCommandPaletteVisible(false);
        break;
      default:
        executeExtensionCommand(commandId);
        break;
    }
  });
}

/** Forwards an extension command id to Main via the same path as palette selection. */
function executeExtensionCommand(commandId: string): void {
  window.financeShell?.extensions
    .executeCommand(commandId)
    .then((result) => {
      if (result && !result.executed) {
        rendererLogger.warn(`extension command "${commandId}" did not execute: ${result.reason ?? 'unknown reason'}`, 'shortcut');
      }
    })
    .catch((err) => rendererLogger.error(`extension command "${commandId}" threw`, 'shortcut', err as Error));
  setCommandPaletteVisible(false);
}
