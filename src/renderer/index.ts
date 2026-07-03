import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/ai-panel';
import './components/command-palette';
import type { ActivityView } from './components/activity-bar';
import type { PaletteCommand } from './components/command-palette';

const app = document.querySelector<HTMLElement>('#app');
const commandPalette = document.querySelector<HTMLElement & { focusInput(): void; extensionCommands: PaletteCommand[] }>('#command-palette');
const navigationPanel = document.querySelector<HTMLElement & { setView(view: string): void }>('#navigation-panel');
const activityBar = document.querySelector<HTMLElement & { views: ActivityView[]; activeView: string }>('#activity-bar');

function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible) commandPalette?.focusInput();
}

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
      activityBar.views = contributions.views.map((v) => ({ id: v.view.id, name: v.view.name, icon: v.view.icon }));
    }
    if (commandPalette) {
      commandPalette.extensionCommands = contributions.commands.map((c) => ({
        id: c.command.id,
        label: c.command.title,
        extensionCommand: true
      }));
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
  if (navigationPanel) navigationPanel.setView(customEvent.detail.view);
  // Ask Main to activate the extension behind this view (no-op for built-in settings view).
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

  if (event.key === 'Escape') setCommandPaletteVisible(false);
});
