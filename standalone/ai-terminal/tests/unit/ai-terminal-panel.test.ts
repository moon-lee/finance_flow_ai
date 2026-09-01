// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../src/renderer/components/ai-terminal-panel';
describe('ai-terminal-panel standalone', ()=>{
  beforeEach(()=>{ document.body.innerHTML='<ai-terminal-panel></ai-terminal-panel>'; });
  it('renders input and close', async ()=>{
    const el=document.querySelector('ai-terminal-panel') as any; await el.updateComplete;
    expect(el.shadowRoot.querySelector('#ai-terminal-input')).toBeTruthy();
  });
});
