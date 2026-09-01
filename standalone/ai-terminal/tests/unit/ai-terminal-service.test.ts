import { describe, it, expect, beforeEach } from 'vitest';
import { AiTerminalService } from '../../src/main/services/ai-terminal-service';
import { __clearSettings } from '../../src/main/services/settings-service';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('AiTerminalService standalone', ()=>{
  beforeEach(()=>{ __clearSettings(); });
  it('defaults dbPath empty', ()=>{ const s=new AiTerminalService(); expect(s.getDbPath()).toBe(''); });
  it('defaults height 260 visible true', ()=>{
    const s=new AiTerminalService();
    expect(s.getHeight()).toBe(260);
    expect(s.isVisible()).toBe(true);
  });
  it('persists height and visible', ()=>{
    const s=new AiTerminalService();
    s.setHeight(400);
    expect(s.getHeight()).toBe(400);
    s.setVisible(false);
    expect(s.isVisible()).toBe(false);
  });
  it('getReportsDir returns userData/Reports', ()=>{
    const s=new AiTerminalService();
    expect(s.getReportsDir('/tmp/userData')).toBe('/tmp/userData/Reports');
  });
  it('setDbPath rejects invalid path (no .db extension)', ()=>{
    const s=new AiTerminalService();
    s.setDbPath('/tmp/not-a-db.txt');
    expect(s.getDbPath()).toBe('');
  });
  it('setDbPath accepts valid existing .db file', ()=>{
    const tmp = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    fs.writeFileSync(tmp, '');
    try {
      const s=new AiTerminalService();
      s.setDbPath(tmp);
      expect(s.getDbPath()).toBe(tmp);
    } finally {
      try{ fs.unlinkSync(tmp);}catch{}
    }
  });
});
