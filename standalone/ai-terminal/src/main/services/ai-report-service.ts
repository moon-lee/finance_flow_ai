import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function parseReportRequest(prompt: string): { ext: string; fy: string } | null {
  const extMatch = prompt.match(/\bas\s+(html|md|txt|jpg)\s*$/i);
  if (!extMatch) return null;
  const fyMatch = prompt.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  return { ext: extMatch[1].toLowerCase(), fy: fyMatch ? `${fyMatch[1]}-${fyMatch[2]}` : 'latest' };
}

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
