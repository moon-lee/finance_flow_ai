import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
@customElement('ai-terminal-panel')
export class AiTerminalPanel extends LitElement {
  static styles=css`
    :host{ display:flex; flex-direction:column; height:100%; background: var(--sidebar-bg); }
    .header{ display:flex; align-items:center; justify-content:space-between; padding:4px 8px; border-bottom:1px solid var(--panel-border); font-size: var(--ff-font-md); }
    .transcript{ flex:1; overflow:auto; padding:8px; font-family: monospace; font-size: var(--ff-font-md); white-space: pre-wrap; }
    .input-row{ display:flex; padding:6px; border-top:1px solid var(--panel-border); }
    input{ flex:1; background: var(--workspace-bg); color: var(--text-primary); border:1px solid var(--panel-border); padding:6px 8px; font-family: monospace; }
  `;
  @state() private _lines: Array<{role:'user'|'assistant', text:string}> = [];
  focusInput(){ (this.shadowRoot?.querySelector('#ai-terminal-input') as HTMLInputElement)?.focus(); }
  private _onKey(e: KeyboardEvent){
    if(e.key==='Enter'){
      const input=this.shadowRoot?.querySelector('#ai-terminal-input') as HTMLInputElement;
      const text=input.value.trim(); if(!text) return;
      this._lines=[...this._lines, {role:'user', text}]; input.value='';
      void (window as any).financeShell?.aiTerminal.send(text).then((r:any)=>{
        this._lines=[...this._lines, {role:'assistant', text: r?.output ?? ''}];
        this.requestUpdate();
      });
    }
  }
  private _onClose(){ (window as any).financeShell?.aiTerminal.toggle?.(); }
  render(){ return html`<div class="header"><span>AI-Terminal</span><button data-action="close" @click=${this._onClose}>✕</button></div><div class="transcript">${this._lines.map(l=> html`<div class="${l.role}">${l.role==='user'?'> ':''}${l.text}</div>`)}</div><div class="input-row"><input id="ai-terminal-input" placeholder="summarize 2025-2026 / report 2025-2026 as html" @keydown=${this._onKey} /></div>`; }
}
