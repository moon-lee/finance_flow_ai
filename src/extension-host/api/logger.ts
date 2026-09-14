import { BaseLogger, type LogPayload } from '../../shared/base-logger';

declare const process: NodeJS.Process & {
  parentPort: {
    postMessage(message: unknown): void;
  } | null;
};

export class ExtensionLogger extends BaseLogger {
  constructor(
    context: string,
    private consoleImpl: {
      log: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      info?: (...args: unknown[]) => void;
      debug?: (...args: unknown[]) => void;
    } = console
  ) {
    super(context, 'info');
  }

  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    const c = this.consoleImpl;
    if (entry.level === 'error') c.error(line, errorArg ?? '');
    else if (entry.level === 'warn') c.warn(line, errorArg ?? '');
    else if (entry.level === 'info') (c.info ?? c.log)(line, errorArg ?? '');
    else (c.debug ?? c.log)(line, errorArg ?? '');

    try {
      const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void } }).parentPort;
      if (parentPort) {
        parentPort.postMessage({
          jsonrpc: '2.0',
          method: 'host.log',
          params: {
            level: entry.level,
            message: entry.message,
            context: entry.context,
            error: entry.error,
            timestamp: entry.timestamp,
            file: entry.file,
            line: entry.line,
          },
        });
      }
    } catch {
      // parentPort unavailable; logging must never break extension code
    }
  }
}
