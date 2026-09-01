import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
describe('standalone scaffold', ()=>{
  it('package.json exists with electron', ()=>{
    const candidates = ['standalone/ai-terminal/package.json', 'package.json', path.join(import.meta.dirname ?? '.', '../../package.json')];
    let pkg: { devDependencies: Record<string,string>} | null = null;
    let lastErr: unknown;
    for (const p of candidates) {
      try { pkg = JSON.parse(fs.readFileSync(p,'utf-8')); break; } catch(e){ lastErr = e; }
    }
    // also try resolving from CWD upwards
    if (!pkg) {
      try { pkg = JSON.parse(fs.readFileSync(path.resolve('standalone/ai-terminal/package.json'),'utf-8')); } catch {}
    }
    if (!pkg) {
      try { pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'),'utf-8')); } catch {}
    }
    if (!pkg) throw lastErr;
    expect(pkg!.devDependencies.electron).toBeDefined();
  });
});
