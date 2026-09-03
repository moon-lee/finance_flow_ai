import { describe, it, expect, vi } from 'vitest';
import { AiOpencodeService } from '../../src/main/services/ai-opencode-service';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('AiOpencodeService standalone', ()=>{
  it('getDbPath returns fallback', ()=>{
    const s=new AiOpencodeService('/tmp/fallback.db');
    expect(s.getDbPath()).toBe('/tmp/fallback.db');
  });

  it('setDbPath validates existsSync and .db', ()=>{
    const tmp = path.join(os.tmpdir(), `opencode-${Date.now()}.db`);
    fs.writeFileSync(tmp, '');
    try{
      const s=new AiOpencodeService('/tmp/fallback.db');
      s.setDbPath(tmp);
      expect(s.getDbPath()).toBe(tmp);
      s.setDbPath('/tmp/invalid.txt');
      expect(s.getDbPath()).toBe(tmp);
    } finally { try{fs.unlinkSync(tmp);}catch{ void 0; } }
  });

  it('getSystemPrompt includes db path', ()=>{
    const s=new AiOpencodeService('/my/db.db');
    expect(s.getSystemPrompt()).toContain('/my/db.db');
  });

  it('selectDbPath uses dialog and validates', async ()=>{
    const tmp = path.join(os.tmpdir(), `select-${Date.now()}.db`);
    fs.writeFileSync(tmp, '');
    try{
      const mockDialog = { showOpenDialog: vi.fn(async ()=>({ canceled:false, filePaths:[tmp]})) } as unknown as { showOpenDialog: (opts:unknown)=>Promise<{canceled:boolean,filePaths:string[]}> };
      const s=new AiOpencodeService('/tmp/fallback.db', { dialog: mockDialog as unknown as never });
      const p = await s.selectDbPath();
      expect(p).toBe(tmp);
      expect(s.getDbPath()).toBe(tmp);
      expect(mockDialog.showOpenDialog).toHaveBeenCalled();
    } finally { try{fs.unlinkSync(tmp);}catch{ void 0; } }
  });

  it('selectDbPath returns fallback when canceled', async ()=>{
    const mockDialog = { showOpenDialog: vi.fn(async ()=>({ canceled:true, filePaths:[]})) } as unknown as { showOpenDialog: (opts:unknown)=>Promise<{canceled:boolean,filePaths:string[]}> };
    const s=new AiOpencodeService('/tmp/fallback.db', { dialog: mockDialog as unknown as never });
    const p = await s.selectDbPath();
    expect(p).toBe('/tmp/fallback.db');
  });

  it('selectDbPath handles dialog error gracefully', async ()=>{
    const mockDialog = { showOpenDialog: vi.fn(async ()=>{ throw new Error('dialog fail'); }) } as unknown as { showOpenDialog: (opts:unknown)=>Promise<{canceled:boolean,filePaths:string[]}> };
    const s=new AiOpencodeService('/tmp/fallback.db', { dialog: mockDialog as unknown as never });
    const p = await s.selectDbPath();
    expect(p).toBe('/tmp/fallback.db');
  });

  it('extractTextFromJson handles variants', ()=>{
    const s=new AiOpencodeService('/tmp/db.db');
    const ex = (obj: unknown)=> (s as unknown as { __extractTextFromJson:(o:unknown)=>string }).__extractTextFromJson(obj);
    expect(ex('hello')).toBe('hello');
    expect(ex({ output:'out1'})).toBe('out1');
    expect(ex({ text:'text1'})).toBe('text1');
    expect(ex([{ text:'a'},{ output:'b'}])).toBe('a\nb');
    expect(ex({ content:[{ text:'c'},{ text:'d'}]})).toBe('c\nd');
    expect(ex({ foo:'bar'})).toBe(JSON.stringify({ foo:'bar'}));
  });

  it('isInstalled returns boolean', async ()=>{
    const s=new AiOpencodeService('/tmp/db.db');
    const r = await s.isInstalled();
    expect(typeof r).toBe('boolean');
  });
});
