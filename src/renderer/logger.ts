import { BaseLogger, type LogPayload } from '../shared/base-logger';

class RendererLogger extends BaseLogger {
  constructor() {
    super('renderer', 'info');
  }

  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    if (entry.level === 'error') console.error(line, errorArg ?? '');
    else if (entry.level === 'warn') console.warn(line, errorArg ?? '');
    else if (entry.level === 'info') console.info(line, errorArg ?? '');
    else console.debug(line, errorArg ?? '');
    try {
      const shell = (globalThis as unknown as { window?: { financeShell?: { events?: { emit(t: string, p: unknown): unknown } } } }).window?.financeShell;
      void shell?.events?.emit(`log.${entry.level}`, entry);
    } catch {
      // logging must never break rendering
    }
  }
}

const rendererLogger = new RendererLogger();

export { rendererLogger };
