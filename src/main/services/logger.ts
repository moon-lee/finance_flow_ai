import { EventBus } from './event-bus';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  timestamp: number;
  file?: string;
  line?: number;
}

export class LoggerImpl {
  private minLevel: LogLevel = 'info';

  constructor(
    private eventBus: EventBus | null,
    minLevel: LogLevel = 'info'
  ) {
    this.minLevel = minLevel;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return order[level] >= order[this.minLevel];
  }

  private publish(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;

    const message = args[0] instanceof Error ? args[0].message : String(args[0] ?? '');
    const context = args[1] instanceof Error ? undefined : (typeof args[1] === 'string' ? args[1] : undefined);
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const callerInfo = this.getCallerInfo();

    const payload: LogPayload = {
      level,
      message,
      context,
      error: errorArg?.stack ?? errorArg?.message,
      timestamp: Date.now(),
      file: callerInfo?.file,
      line: callerInfo?.line,
    };

    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    const output = context ? `[${context}] ${message}${suffix}` : `${message}${suffix}`;

    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'log'](
      output,
      errorArg ?? ''
    );

    if (this.eventBus) {
      this.eventBus.publish(`log.${level}`, payload, null);
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

  log(message: string, ...args: unknown[]): void {
    this.publish('info', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.publish('error', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.publish('warn', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.publish('info', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.publish('debug', message, ...args);
  }
}

let loggerInstance: LoggerImpl | null = null;

export function createLogger(eventBus: EventBus | null, minLevel: LogLevel = 'info'): LoggerImpl {
  loggerInstance = new LoggerImpl(eventBus, minLevel);
  return loggerInstance;
}

export function getLogger(): LoggerImpl {
  if (!loggerInstance) {
    return new LoggerImpl(null, 'info');
  }
  return loggerInstance;
}
