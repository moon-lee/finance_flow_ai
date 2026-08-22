declare const process: NodeJS.Process & {
  parentPort: {
    postMessage(message: unknown): void;
  } | null;
};

export class ExtensionLogger {
  constructor(
    private context: string,
    private consoleImpl: {
      log: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
    } = console
  ) {}

  private log(level: 'log' | 'error' | 'warn', ...args: unknown[]): void {
    const prefixed = [`[${this.context}]`, ...args];

    if (level === 'error') this.consoleImpl.error(...prefixed);
    else if (level === 'warn') this.consoleImpl.warn(...prefixed);
    else this.consoleImpl.log(...prefixed);

    try {
      const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void } }).parentPort;
      if (parentPort) {
        const stringifiedArgs = prefixed.map((a) => {
          if (a instanceof Error) return a.stack ?? a.message;
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        });
        parentPort.postMessage({
          jsonrpc: '2.0',
          method: 'host.log',
          params: {
            level,
            args: stringifiedArgs,
          },
        });
      }
    } catch {
      // parentPort unavailable; logging must never break extension code
    }
  }

  error(...args: unknown[]): void {
    this.log('error', ...args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }

  info(...args: unknown[]): void {
    this.log('log', ...args);
  }

  debug(...args: unknown[]): void {
    this.log('log', ...args);
  }
}
