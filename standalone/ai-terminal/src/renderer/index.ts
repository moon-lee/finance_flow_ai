import './components/ai-terminal-panel';

const app = document.getElementById('app');
const panel = document.getElementById('ai-terminal-panel');
const resizer = document.getElementById('ai-terminal-resizer');

let isDragging = false;

resizer?.addEventListener('mousedown', () => {
  isDragging = true;
  resizer.classList.add('dragging');
});

window.addEventListener('mousemove', (e: MouseEvent) => {
  if (!isDragging || !app) return;
  const appRect = app.getBoundingClientRect();
  const newHeight = appRect.bottom - e.clientY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--status-bar-height')) || 22);
  const clamped = Math.max(120, Math.min(600, newHeight));
  document.documentElement.style.setProperty('--ai-terminal-height', `${clamped}px`);
  (window as unknown as { financeShell?: { settings?: { set?: (k:string,v:unknown)=>void }}}).financeShell?.settings?.set?.('core.ai-terminal.height', clamped);
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    resizer?.classList.remove('dragging');
  }
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    app?.classList.toggle('ai-terminal-collapsed');
    (window as unknown as { financeShell?: { aiTerminal?: { toggle?: ()=>void }}}).financeShell?.aiTerminal?.toggle?.();
  }
});

(window as unknown as { focusAiTerminal?: ()=>void }).focusAiTerminal = () => {
  (panel as unknown as { focusInput?: ()=>void })?.focusInput?.();
};
