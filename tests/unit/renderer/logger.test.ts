import { describe, it, expect } from 'vitest';
import { formatLine } from '../../../src/shared/base-logger';

describe('renderer log subscriber', () => {
  it('formats DevTools line identically to terminal', () => {
    const line = formatLine({ level: 'warn', message: 'm', context: 'renderer', timestamp: 1726300000000, file: 'x.ts', line: 1 });
    expect(line).toContain('[WARN]');
    expect(line).toContain('[renderer]');
  });
});
