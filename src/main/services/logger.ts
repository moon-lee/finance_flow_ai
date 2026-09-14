import { EventBus } from './event-bus';
import { BaseLogger, type LogLevel, type LogPayload } from '../../shared/base-logger';

export type { LogLevel, LogPayload };

export class LoggerImpl extends BaseLogger {
  constructor(
    private eventBus: EventBus | null,
    minLevel: LogLevel = 'info'
  ) {
    super('main', minLevel);
  }

  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    const method = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : entry.level === 'info' ? 'info' : 'log';
    (console[method] as (...a: unknown[]) => void)(line, errorArg ?? '');

    if (this.eventBus) {
      this.eventBus.publish(`log.${entry.level}`, entry, null);
    }
  }

  override log(...args: unknown[]): void {
    this.info(...args);
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
