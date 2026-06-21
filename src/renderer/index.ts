import './components/activity-bar';
import './components/navigation-panel';
import './components/workspace';
import './components/ai-panel';
import './components/command-palette';

const app = document.querySelector<HTMLElement>('#app');
const commandPalette = document.querySelector<HTMLElement & { focusInput(): void }>('#command-palette');
const navigationPanel = document.querySelector<HTMLElement & { setView(view: string): void }>('#navigation-panel');

function setCommandPaletteVisible(visible: boolean): void {
  commandPalette?.classList.toggle('hidden', !visible);
  if (visible) {
    commandPalette?.focusInput();
  }
}

function toggleAiPanel(): void {
  app?.classList.toggle('ai-collapsed');
  void window.financeShell?.settings.set('core.ui.aiCollapsed', app?.classList.contains('ai-collapsed'));
}

async function applyTheme(theme: unknown): Promise<void> {
  // Defensive: the DB could contain a non-string for "core.theme" if
  // a future migration wrote one. Fall back to dark for any value
  // other than the literal string "light" rather than corrupting UI
  // state. Accepting `unknown` here forces callers to drop unchecked
  // casts at the IPC boundary.
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

async function toggleTheme(): Promise<void> {
  const isLight = document.body.classList.toggle('light-theme');
  await window.financeShell?.settings.set('core.theme', isLight ? 'light' : 'dark');
}

window.addEventListener('click', (event) => {
  if (commandPalette && !commandPalette.classList.contains('hidden')) {
    const path = event.composedPath();
    if (!path.includes(commandPalette)) {
      setCommandPaletteVisible(false);
    }
  }
});

window.addEventListener('view-changed', (event: Event) => {
  const customEvent = event as CustomEvent<{ view: string }>;
  if (navigationPanel) {
    navigationPanel.setView(customEvent.detail.view);
  }
});

window.addEventListener('command-selected', (event: Event) => {
  const customEvent = event as CustomEvent<{ command: string }>;
  const cmd = customEvent.detail.command;
  if (cmd === 'toggle-ai') {
    toggleAiPanel();
  } else if (cmd === 'view-dashboard') {
    if (navigationPanel) {
      navigationPanel.setView('Dashboard');
    }
  }
  setCommandPaletteVisible(false);
});

window.addEventListener('DOMContentLoaded', async () => {
  const version = await window.financeShell?.getVersion() ?? 'dev-browser';

  // Load persisted theme
  const theme = await window.financeShell?.settings.get('core.theme');
  if (theme !== undefined) {
    await applyTheme(theme);
  }

  // Load persisted AI panel state — strict `=== true` so a non-boolean
  // truthy value (e.g. a string from a corrupt DB row) does not
  // silently collapse the panel.
  const aiCollapsed = await window.financeShell?.settings.get('core.ui.aiCollapsed');
  if (aiCollapsed === true) {
    app?.classList.add('ai-collapsed');
  }

  // Build status bar
  const statusBar = document.querySelector('#status-bar');
  if (statusBar) {
    // Theme toggle button
    const themeBtn = document.createElement('span');
    themeBtn.className = 'status-item status-btn';
    themeBtn.dataset.action = 'toggle-theme';
    themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    themeBtn.addEventListener('click', async () => {
      await toggleTheme();
      themeBtn.textContent = document.body.classList.contains('light-theme') ? '☀ Light' : '🌙 Dark';
    });
    statusBar.appendChild(themeBtn);

    // Version tag
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

  if (event.key === 'Escape') {
    setCommandPaletteVisible(false);
  }
});
