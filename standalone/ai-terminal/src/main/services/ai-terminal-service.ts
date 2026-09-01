import { getSetting, setSetting, registerSettingDefault } from './settings-service';
import { existsSync } from 'node:fs';

export class AiTerminalService {
  constructor() {
    registerSettingDefault('core.ai-terminal.height', 260);
    registerSettingDefault('core.ai-terminal.visible', true);
    registerSettingDefault('core.ai-terminal.dbPath', '');
  }

  getHeight(): number {
    return (getSetting<number>('core.ai-terminal.height') ?? 260);
  }

  setHeight(h: number): void {
    setSetting('core.ai-terminal.height', h);
  }

  isVisible(): boolean {
    return (getSetting<boolean>('core.ai-terminal.visible') ?? true);
  }

  setVisible(v: boolean): void {
    setSetting('core.ai-terminal.visible', v);
  }

  getDbPath(): string {
    return (getSetting<string>('core.ai-terminal.dbPath') ?? '');
  }

  setDbPath(path: string): void {
    if (path && existsSync(path) && path.endsWith('.db')) {
      setSetting('core.ai-terminal.dbPath', path);
    }
  }

  getReportsDir(userData: string): string {
    return `${userData}/Reports`;
  }
}
