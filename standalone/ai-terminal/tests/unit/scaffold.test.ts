import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
describe('standalone scaffold', ()=>{
  it('package.json exists with electron', ()=>{
    const pkg=JSON.parse(fs.readFileSync('standalone/ai-terminal/package.json','utf-8'));
    expect(pkg.devDependencies.electron).toBeDefined();
  });
});
