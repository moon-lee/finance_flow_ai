import { spawn as nodeSpawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

// Electron dialog is optional in test environment; use dep injection fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DialogLike = { showOpenDialog: (opts: any) => Promise<{ canceled: boolean; filePaths: string[] }> };

export class AiOpencodeService {
  private hasSentContext = false;

  constructor(
    private fallbackDbPath: string,
    private deps: { spawn?: typeof nodeSpawn; timeoutMs?: number; dialog?: DialogLike } = {},
    private model?: string
  ) {}

  getDbPath(): string {
    return this.fallbackDbPath;
  }

  setDbPath(path: string): void {
    if (existsSync(path) && path.endsWith('.db')) {
      if (this.fallbackDbPath !== path) this.hasSentContext = false;
      this.fallbackDbPath = path;
    }
  }

  async selectDbPath(): Promise<string> {
    console.log(`[ai-terminal] selectDbPath: opening dialog`);
    try {
      // Prefer injected dialog, otherwise try to load electron (may not be available in vitest)
      let dlg: DialogLike | undefined = this.deps.dialog as DialogLike | undefined;
      if (!dlg) {
        try {
          // dynamic import to avoid hard failure in non-electron env
          const electron = await import('electron');
          dlg = (electron as unknown as { dialog: DialogLike }).dialog as DialogLike;
        } catch {
          dlg = undefined;
        }
      }
      if (!dlg) return this.fallbackDbPath;
      const result = await dlg.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        const path = result.filePaths[0];
        console.log(`[ai-terminal] selectDbPath: picked ${path}`);
        if (existsSync(path) && path.endsWith('.db')) {
          if (this.fallbackDbPath !== path) this.hasSentContext = false;
          this.fallbackDbPath = path;
          console.log(`[ai-terminal] selectDbPath: accepted ${path}`);
          return path;
        } else console.log(`[ai-terminal] selectDbPath: rejected (not .db or missing) ${path}`);
      } else console.log(`[ai-terminal] selectDbPath: canceled`);
    } catch (e) {
      console.log(`[ai-terminal] selectDbPath: error ${String(e)}`);
    }
    return this.fallbackDbPath;
  }

  getSystemPrompt(): string {
    return `Your database is at '${this.fallbackDbPath}'. Use Python ${process.version} sqlite3 module to query it.`;
  }

  

  async query(prompt: string): Promise<string> {
    const isFirst = !this.hasSentContext;
    const fullPrompt = isFirst ? `${this.getSystemPrompt()}\nUser: ${prompt}` : `User: ${prompt}`;
    console.log(`[ai-terminal] query: "${prompt.slice(0,80)}" (model: ${this.model ?? 'default'}, db: ${this.fallbackDbPath}, first=${isFirst})`);
    const timeout = this.deps.timeoutMs ?? 180000;
    console.log(`[ai-terminal] query: spawning opencode run --model ${this.model ?? 'default'} --format json (direct, no attach)`);
    console.log(`[ai-terminal] query: fullPrompt ${fullPrompt.length} chars:\n${fullPrompt}`);
    return new Promise((resolve, reject) => {
      const psPrompt = fullPrompt.replace(/'/g, "''").replace(/\r?\n/g, ' ');
      const continueFlag = isFirst ? '' : ' --continue';
      const psCmd = `opencode run --model ${this.model ?? 'opencode/big-pickle'} --format json --auto${continueFlag} '${psPrompt}'`;
      console.log(`[ai-terminal] query: spawning via powershell: ${psCmd}...`);
      const proc = (this.deps.spawn ?? nodeSpawn)('powershell.exe', ['-Command', psCmd], { windowsHide: true } as unknown as Parameters<typeof nodeSpawn>[2]) as ChildProcess;
      let out = '';
      let err = '';
      proc.stdin?.end();
      proc.stdout?.on('data', (d: Buffer | string) => (out += d));
      proc.stderr?.on('data', (d: Buffer | string) => (err += d));
      const t = setTimeout(() => {
        try { proc.kill(); } catch { void 0; }
        console.log(`[ai-terminal] query: timeout after ${timeout}ms`);
        reject(new Error('opencode timeout'));
      }, timeout);
      proc.on('close', (code: number | null) => {
        clearTimeout(t);
        console.log(`[ai-terminal] query: close code=${code} out=${out.length} chars err=${err.slice(0,200)}`);
        if (code === 0) {
          if (isFirst) this.hasSentContext = true;
          try {
            const parsed = JSON.parse(out);
            const text = this.extractTextFromJson(parsed);
            console.log(`[ai-terminal] query: parsed JSON -> ${text.slice(0,120)}...`);
            resolve(text);
          } catch {
            console.log(`[ai-terminal] query: raw out -> ${out.slice(0,120)}...`);
            resolve(out);
          }
        } else { console.log(`[ai-terminal] query: error ${err || `exit ${code}`}`); reject(new Error(err || `exit ${code}`)); }
      });
      proc.on('error', reject);
    });
  }

  private extractTextFromJson(obj: unknown): string {
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj === 'object') {
      const o = obj as Record<string, unknown>;
      if (typeof o['output'] === 'string') return o['output'] as string;
      if (typeof o['text'] === 'string') return o['text'] as string;
      if (Array.isArray(o)) return (o as unknown[]).map((e: unknown) => {
        if (e && typeof e === 'object') {
          const ee = e as Record<string, unknown>;
          return (ee['text'] as string) ?? (ee['output'] as string) ?? '';
        }
        return '';
      }).join('\n');
      if (Array.isArray(obj)) {
        return (obj as unknown[]).map((e: unknown) => {
          if (e && typeof e === 'object') {
            const ee = e as Record<string, unknown>;
            return (ee['text'] as string) ?? (ee['output'] as string) ?? '';
          }
          return '';
        }).join('\n');
      }
      if (o['content'] && Array.isArray(o['content'])) {
        return (o['content'] as Array<Record<string, unknown>>).map((c) => (c['text'] as string) ?? '').join('\n');
      }
    }
    if (Array.isArray(obj)) {
      return (obj as unknown[]).map((e: unknown) => {
        if (e && typeof e === 'object') {
          const ee = e as Record<string, unknown>;
          return (ee['text'] as string) ?? (ee['output'] as string) ?? '';
        }
        return '';
      }).join('\n');
    }
    return JSON.stringify(obj);
  }

  // exposed for tests
  __extractTextFromJson(obj: unknown): string {
    return this.extractTextFromJson(obj);
  }
}
