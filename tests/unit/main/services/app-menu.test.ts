import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  setApplicationMenuMock: vi.fn(),
  buildFromTemplateMock: vi.fn((template) => template),
}));

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: mocks.buildFromTemplateMock,
    setApplicationMenu: mocks.setApplicationMenuMock,
  },
  app: {
    isPackaged: false,
    getPath: vi.fn(() => 'documents'),
  },
}));

import { installApplicationMenu, defaultTerminalCwd } from '../../../../src/main/services/app-menu';

describe('app-menu', () => {
  beforeEach(() => {
    mocks.buildFromTemplateMock.mockClear();
    mocks.setApplicationMenuMock.mockClear();
  });

  it('installs an application menu via Electron Menu', () => {
    installApplicationMenu();
    expect(mocks.buildFromTemplateMock).toHaveBeenCalled();
    expect(mocks.setApplicationMenuMock).toHaveBeenCalled();
  });

  it('includes a Terminal menu with New Terminal item', () => {
    installApplicationMenu();
    const template = mocks.buildFromTemplateMock.mock.calls[0][0] as Array<{
      label?: string;
      submenu?: Array<{ label?: string; accelerator?: string }>;
    }>;
    const terminalMenu = template.find((item) => item.label === 'Terminal');
    expect(terminalMenu).toBeDefined();
    const newTerminal = terminalMenu!.submenu!.find((item) => item.label === 'New Terminal');
    expect(newTerminal).toBeDefined();
    expect(newTerminal!.accelerator).toBe('Ctrl+`');
  });

  it('defaults the terminal cwd to process.cwd() in dev', () => {
    expect(defaultTerminalCwd()).toBe(process.cwd());
  });
});