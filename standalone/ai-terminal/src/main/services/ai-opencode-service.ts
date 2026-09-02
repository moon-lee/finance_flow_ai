import { spawn as nodeSpawn, ChildProcess, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

// Electron dialog is optional in test environment; use dep injection fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DialogLike = { showOpenDialog: (opts: any) => Promise<{ canceled: boolean; filePaths: string[] }> };

const execFileAsync = promisify(execFile);

export class AiOpencodeService {
  private serverProc: ChildProcess | null = null;
  private port = 4096;
  private serverReady = false;

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
    return `Your database is at ${this.fallbackDbPath}. Use sqlite3 -readonly "${this.fallbackDbPath}" to query it. For summarize/estimate/report, query then format as markdown. For report as html/md/txt/jpg, write file to $REPORTS_DIR/report-{FY}.{ext} and return path.`;
  }

  async isInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('cmd.exe', ['/c', 'opencode', '--version'], { timeout: 5000, windowsHide: true } as unknown as Parameters<typeof execFile>[2]) as { stdout: string };
      console.log(`[ai-terminal] isInstalled: true (${String(stdout).trim()})`);
      return true;
    } catch (e) {
      console.log(`[ai-terminal] isInstalled: false (${String(e)})`);
      return false;
    }
  }

  async serve(): Promise<void> {
    if (this.serverReady) return;
    console.log(`[ai-terminal] serve: spawning opencode serve --port ${this.port} (cwd: finance_flow_ai)`);
    return new Promise((resolve) => {
      this.serverProc = (this.deps.spawn ?? nodeSpawn)('cmd.exe', ['/c', 'opencode', 'serve', '--port', String(this.port), '--hostname', '127.0.0.1'], {
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
        cwd: 'D:\\finance_flow_ai',
      } as unknown as Parameters<typeof nodeSpawn>[2]) as ChildProcess;
      this.serverProc?.unref?.();
      const start = Date.now();
      let attempts = 0;
      const tryConnect = () => {
        attempts++;
        import('node:net')
          .then(({ default: net }) => {
            const sock = (net as unknown as { createConnection: (opts: unknown, cb: () => void) => { destroy: () => void; on: (ev: string, cb: () => void) => void } }).createConnection(
              { host: '127.0.0.1', port: this.port },
              () => {
                console.log(`[ai-terminal] serve: port ${this.port} ready after ${attempts} polls (${Date.now() - start}ms)`);
                sock.destroy();
                this.serverReady = true;
                resolve();
              }
            );
            sock.on('error', () => {
              if (Date.now() - start > 10000) {
                console.log(`[ai-terminal] serve: port poll fallback after ${attempts} attempts, assuming ready`);
                this.serverReady = true;
                resolve();
              } else setTimeout(tryConnect, 300);
            });
          })
          .catch(() => setTimeout(() => { this.serverReady = true; resolve(); }, 800));
      };
      setTimeout(tryConnect, 400);
    });
  }

  async stop(): Promise<void> {
    if (this.serverProc) {
      try {
        this.serverProc.kill();
      } catch {}
      this.serverProc = null;
    }
    this.serverReady = false;
  }

  async query(prompt: string): Promise<string> {
    const fullPrompt = `${this.getSystemPrompt()}\n\nUser: ${prompt}`;
    console.log(`[ai-terminal] query: "${prompt.slice(0,80)}" (model: ${this.model ?? 'default'}, db: ${this.fallbackDbPath})`);
    const timeout = this.deps.timeoutMs ?? 180000;
    console.log(`[ai-terminal] query: spawning opencode run --model ${this.model ?? 'default'} --format json (direct, no attach)`);
    const args = ['run', '--model', this.model ?? 'opencode/big-pickle', '--format', 'json', fullPrompt];
    if (this.model) {
      args.push('--model', this.model);
    }
    args.push(prompt);
    console.log(`[ai-terminal] query: fullPrompt ${fullPrompt.length} chars:\n${fullPrompt}`);
    return new Promise((resolve, reject) => {
      const proc = (this.deps.spawn ?? nodeSpawn)('cmd.exe', ['/c', 'opencode', ...args], { windowsHide: true, cwd: 'D:\\finance_flow_ai' } as unknown as Parameters<typeof nodeSpawn>[2]) as ChildProcess;
      let out = '';
      let err = '';
      proc.stdout?.on('data', (d: Buffer | string) => (out += d));
      proc.stderr?.on('data', (d: Buffer | string) => (err += d));
      const t = setTimeout(() => {
        try { proc.kill(); } catch {}
        console.log(`[ai-terminal] query: timeout after ${timeout}ms`);
        reject(new Error('opencode timeout'));
      }, timeout);
      proc.on('close', (code: number | null) => {
        clearTimeout(t);
        console.log(`[ai-terminal] query: close code=${code} out=${out.length} chars err=${err.slice(0,200)}`);
        if (code === 0) {
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
