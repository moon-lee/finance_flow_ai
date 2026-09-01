import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class AiReportService {
  constructor(private reportsDir: string) {}

  async writeReport(content: string, fy: string, ext: string): Promise<string> {
    if (!existsSync(this.reportsDir)) mkdirSync(this.reportsDir, { recursive: true });
    const p = join(this.reportsDir, `report-${fy}.${ext}`);
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  async openReport(path: string): Promise<void> {
    try {
      const { shell } = await import('electron');
      await shell.openPath(path);
    } catch {
      // in test env electron may not be available; no-op
    }
  }
}
