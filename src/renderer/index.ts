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
  const statusBar = document.querySelector('#status-bar');
  if (statusBar) {
    const versionTag = document.createElement('span');
    versionTag.className = 'status-item version-tag';
    versionTag.style.marginLeft = 'auto';
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
