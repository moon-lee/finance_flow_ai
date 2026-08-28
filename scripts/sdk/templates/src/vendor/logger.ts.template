export class ExtensionLogger {
  constructor(private context: string, private impl: Pick<Console,'log'|'warn'|'error'> = console) {}
  private out(level:'log'|'warn'|'error', ...args: unknown[]) {
    const msg = args[0] instanceof Error ? args[0].message : String(args[0] ?? '');
    const prefix = `[${this.context}] ${msg}`;
    if (level==='error') this.impl.error(prefix, ...args.slice(1));
    else if (level==='warn') this.impl.warn(prefix, ...args.slice(1));
    else this.impl.log(prefix, ...args.slice(1));
    try { const pp: any = (globalThis as any).process?.parentPort; if (pp?.postMessage) pp.postMessage({ jsonrpc:'2.0', method:'host.log', params:{ level, args:[msg], file: undefined, line: undefined } }); } catch {}
  }
  info(...a: unknown[]) { this.out('log', ...a); }
  warn(...a: unknown[]) { this.out('warn', ...a); }
  error(...a: unknown[]) { this.out('error', ...a); }
  debug(...a: unknown[]) { this.out('log', ...a); }
}
