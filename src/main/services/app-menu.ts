import { Menu, type MenuItemConstructorOptions, app } from 'electron';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { accessSync, constants } from 'node:fs';

/**
 * Application menu bar with a "Terminal → New Terminal" action.
 *
 * On Windows, opens a "local terminal" (Windows Terminal if available,
 * otherwise cmd.exe) with the working directory set to `cwd`.
 */

function isExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function spawnWindowsTerminal(cwd: string, terminalPath: string): void {
  // `wt.exe -d <dir>` starts a terminal rooted at the given directory.
  const child = spawn(terminalPath, ['-d', cwd], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', (err) => {
    console.error(`[menu] failed to spawn ${terminalPath}:`, err);
  });
  child.unref();
}

function spawnCmd(cwd: string): void {
  const child = spawn('cmd.exe', ['/K', `cd /d "${cwd}"`], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', (err) => {
    console.error('[menu] failed to spawn cmd.exe:', err);
  });
  child.unref();
}

function openLocalTerminal(cwd: string): void {
  if (process.platform !== 'win32') {
    console.warn('[menu] New Terminal currently only supported on Windows');
    return;
  }
  cwd = resolve(cwd);

  const wtPath = 'wt.exe';
  try {
    accessSync(wtPath, constants.X_OK);
    spawnWindowsTerminal(cwd, wtPath);
    return;
  } catch {
    // wt.exe not on PATH — fall through to cmd.exe.
  }

  const wtFull = 'C:\\Users\\Moon\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';
  if (isExecutable(wtFull)) {
    spawnWindowsTerminal(cwd, wtFull);
    return;
  }

  spawnCmd(cwd);
}

/** Default working directory for "New Terminal".
 *
 * Dev (`npm run dev` / `npm start`): the project directory Electron was
 * launched from (`process.cwd()`). `app.getPath('exe')` is NOT used here —
 * in dev the exe is Electron's own binary inside `node_modules`, not the app.
 * Packaged (`Finance Flow AI.exe`): the folder containing the exe
 * (`dirname(app.getPath('exe'))`), so the terminal lands beside `data\`.
 */
export function defaultTerminalCwd(): string {
  if (app.isPackaged) return dirname(app.getPath('exe'));
  return process.cwd();
}

function openLogViewer(): void {
  const exe = 'C:\\Users\\Moon\\AppData\\Local\\finance_flow_log_viewer\\finance-flow-log-viewer.exe';
  const child = spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', (err) => {
    console.error('[menu] failed to spawn log viewer:', err);
  });
  child.unref();
}
function buildTemplate(): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({ role: 'appMenu' });
  }

  template.push(
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'Ctrl+`',
          click: () => openLocalTerminal(defaultTerminalCwd()),
        },
        {
          label: 'Run Log Viewer',
          click: () => openLogViewer(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'windowMenu' },
    { role: 'help' },
  );

  return template;
}

/** Call once after `app.whenReady()` to install the application menu. */
export function installApplicationMenu(): void {
  const menu = Menu.buildFromTemplate(buildTemplate());
  Menu.setApplicationMenu(menu);
}