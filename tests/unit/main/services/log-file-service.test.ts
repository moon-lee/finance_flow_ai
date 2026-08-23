import { describe, expect, it } from 'vitest';
import { LogFileService } from '../../../../src/main/services/log-file-service';
import { mkdirSync, rmSync } from 'node:fs';

describe('LogFileService', () => {
  const tmpDir = 'D:/finance_flow_ai/tmp-logs';

  function createService() {
    mkdirSync(tmpDir, { recursive: true });
    return new LogFileService(tmpDir);
  }

  function cleanup() {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  it('writes entries and reads them back', () => {
    const service = createService();
    service.enqueue({ level: 'info', message: 'hello', timestamp: Date.now() });
    service['flush']();
    const entries = service.read(service['logPath']);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('hello');
    cleanup();
  });

  it('rotates when file exceeds max size', () => {
    const service = createService();
    const big = 'x'.repeat(3 * 1024 * 1024);
    service.enqueue({ level: 'info', message: big, timestamp: Date.now() });
    service['flush']();
    service.enqueue({ level: 'info', message: big, timestamp: Date.now() });
    service['flush']();
    const files = service.list();
    expect(files.some((f) => f.path.endsWith('app.log.1'))).toBe(true);
    cleanup();
  });

  it('lists available log files', () => {
    const service = createService();
    service.enqueue({ level: 'info', message: 'hello', timestamp: Date.now() });
    service['flush']();
    const files = service.list();
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0].path).toContain('app.log');
    cleanup();
  });
});
