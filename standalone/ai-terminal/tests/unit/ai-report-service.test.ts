import { describe, it, expect } from 'vitest';
import { AiReportService, parseReportRequest } from '../../src/main/services/ai-report-service';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('AiReportService standalone', ()=>{
  it('writes md file', async ()=>{
    const dir = path.join(os.tmpdir(), `reports-${Date.now()}`);
    const svc = new AiReportService(dir);
    const p = await svc.writeReport('# hi', '2025-2026', 'md');
    expect(p).toContain('report-2025-2026.md');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p,'utf-8')).toBe('# hi');
    fs.rmSync(dir,{recursive:true, force:true});
  });

  it('writes html/txt variants', async ()=>{
    const dir = path.join(os.tmpdir(), `reports-${Date.now()}-2`);
    const svc = new AiReportService(dir);
    const pHtml = await svc.writeReport('<h1>hi</h1>', '2025-2026', 'html');
    const pTxt = await svc.writeReport('hi', '2025-2026', 'txt');
    expect(pHtml).toContain('.html');
    expect(pTxt).toContain('.txt');
    fs.rmSync(dir,{recursive:true, force:true});
  });

  it('parseReportRequest detects ext and fy', ()=>{
    expect(parseReportRequest('report summary payslip as html')).toEqual({ ext: 'html', fy: 'latest' });
    expect(parseReportRequest('report 2025-2026 as md')).toEqual({ ext: 'md', fy: '2025-2026' });
    expect(parseReportRequest('summarize 2025-2026')).toBeNull();
  });

  it('openReport does not throw without electron', async ()=>{
    const dir = path.join(os.tmpdir(), `reports-${Date.now()}-3`);
    const svc = new AiReportService(dir);
    await expect(svc.openReport('/tmp/some.html')).resolves.toBeUndefined();
  });
});
