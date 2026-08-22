import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const LOG_DIR_NAME = 'logs';
const LOG_FILE_NAME = 'app.log';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_BACKUP_FILES = 10;
const FLUSH_INTERVAL_MS = 500;

interface LogEntry {
  level: string;
  message: string;
  context?: string;
  error?: string;
  timestamp: number;
  file?: string;
  line?: number;
}

export class LogFileService {
  private readonly logDir: string;
  private readonly logPath: string;
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentSize = 0;

  constructor(userDataPath: string) {
    this.logDir = join(userDataPath, LOG_DIR_NAME);
    this.logPath = join(this.logDir, LOG_FILE_NAME);
    this.ensureLogDir();
    this.currentSize = this.getCurrentSize();
    this.startFlushTimer();
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getCurrentSize(): number {
    try {
      return statSync(this.logPath).size;
    } catch {
      return 0;
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  enqueue(entry: LogEntry): void {
    this.buffer.push(entry);
    if (entry.level === 'error') {
      this.flush();
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      const size = Buffer.byteLength(lines);

      if (this.currentSize + size > MAX_FILE_SIZE) {
        this.rotate();
      }

      writeFileSync(this.logPath, lines, { flag: 'a' });
      this.currentSize += size;
    } catch {
      // best-effort; logging must not break app flow
    }
  }

  private rotate(): void {
    try {
      for (let i = MAX_BACKUP_FILES - 1; i >= 1; i--) {
        const src = i === 1 ? this.logPath : join(this.logDir, `${LOG_FILE_NAME}.${i - 1}`);
        const dest = join(this.logDir, `${LOG_FILE_NAME}.${i}`);
        if (existsSync(dest)) {
          unlinkSync(dest);
        }
        if (existsSync(src)) {
          renameSync(src, dest);
        }
      }
      this.currentSize = 0;
    } catch {
      // best-effort
    }
  }

  list(): Array<{ path: string; size: number; mtime: number }> {
    const result: Array<{ path: string; size: number; mtime: number }> = [];

    try {
      const entries = [
        { path: this.logPath, base: LOG_FILE_NAME },
        ...Array.from({ length: MAX_BACKUP_FILES }, (_, i) => ({
          path: join(this.logDir, `${LOG_FILE_NAME}.${i + 1}`),
          base: `${LOG_FILE_NAME}.${i + 1}`,
        })),
      ];

      for (const entry of entries) {
        if (existsSync(entry.path)) {
          const stats = statSync(entry.path);
          result.push({
            path: entry.path,
            size: stats.size,
            mtime: stats.mtimeMs,
          });
        }
      }
    } catch {
      // best-effort
    }

    return result.sort((a, b) => b.mtime - a.mtime);
  }

  read(path: string): LogEntry[] {
    const entries: LogEntry[] = [];
    try {
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // best-effort
    }
    return entries;
  }
}
