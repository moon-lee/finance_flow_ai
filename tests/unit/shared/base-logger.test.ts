import { describe, it, expect } from 'vitest';
import { BaseLogger, formatLine, normalizeArgs, type LogPayload } from '../../../src/shared/base-logger';

class TestLogger extends BaseLogger {
  public written: Array<{ entry: LogPayload; line: string }> = [];
  protected write(entry: LogPayload, line: string): void {
    this.written.push({ entry, line });
  }
}

describe('BaseLogger', () => {
  it('normalizes message + context + Error', () => {
    const err = new Error('boom');
    const n = normalizeArgs('hello', 'myctx', err);
    expect(n.message).toBe('hello');
    expect(n.context).toBe('myctx');
    expect(n.error).toContain('boom');
  });

  it('formats canonical line with timestamp + level + context', () => {
    const line = formatLine({ level: 'info', message: 'hi', context: 'ctx', timestamp: 1726300000000 });
    expect(line).toContain('[INFO]');
    expect(line).toContain('[ctx]');
    expect(line).toContain('hi');
  });

  it('filters below minLevel and aliases log to info', () => {
    const l = new TestLogger('t', 'warn');
    l.info('suppressed');
    expect(l.written.length).toBe(0);
    l.warn('shown');
    expect(l.written.length).toBe(1);
    expect(l.written[0].entry.level).toBe('warn');
    l.log('alias');
    expect(l.written.length).toBe(1); // warn logger suppresses info alias
    l.setMinLevel('debug');
    l.log('now-shown');
    expect(l.written.length).toBe(2);
    expect(l.written[1].entry.level).toBe('info');
  });
});
