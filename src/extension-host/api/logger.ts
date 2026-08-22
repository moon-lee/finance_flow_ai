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
    const message = args[0] instanceof Error ? args[0].message : String(args[0] ?? '');
    const context = args[1] instanceof Error ? undefined : (typeof args[1] === 'string' ? args[1] : undefined);
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const callerInfo = this.getCallerInfo();

    const output = errorArg
      ? `[${this.context}] ${message} ${errorArg.stack ?? errorArg.message}`
      : `[${this.context}] ${message}`;
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';

    if (level === 'error') this.consoleImpl.error(output + suffix, errorArg ?? '');
    else if (level === 'warn') this.consoleImpl.warn(output + suffix, errorArg ?? '');
    else this.consoleImpl.log(output + suffix, errorArg ?? '');

    try {
      const parentPort = (process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void } }).parentPort;
      if (parentPort) {
        const stringifiedArgs = [message];
        if (context) stringifiedArgs.push(context);
        if (errorArg) stringifiedArgs.push(errorArg.stack ?? errorArg.message);
        parentPort.postMessage({
          jsonrpc: '2.0',
          method: 'host.log',
          params: {
            level,
            args: stringifiedArgs,
            file: callerInfo?.file,
            line: callerInfo?.line,
          },
        });
      }
    } catch {
      // parentPort unavailable; logging must never break extension code
    }
  }

  private getCallerInfo(): { file: string; line: number } | null {
    const stack = new Error().stack;
    if (!stack) return null;
    const lines = stack.split('\n').slice(2);
    for (const line of lines) {
      const match = line.match(/\(([^)]+):(\d+):\d+\)/);
      if (!match) continue;
      const fullPath = match[1];
      if (fullPath.endsWith('logger.ts')) continue;
      const file = fullPath.split(/[\\/]/).pop() ?? fullPath;
      return { file, line: parseInt(match[2], 10) };
    }
    return null;
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
