const rendererLogger = {
  log: (message: string, ...args: unknown[]) => {
    const context = args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer');
    const callerInfo = getRendererCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const output = context ? `[${context}] ${message}${suffix}` : `${message}${suffix}`;
    console.log(output, errorArg ?? '');
    window.financeShell?.events?.emit('log.info', { message: `${message}${suffix}`, context });
  },
  error: (message: string, ...args: unknown[]) => {
    const context = args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer');
    const callerInfo = getRendererCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const output = context ? `[${context}] ${message}${suffix}` : `${message}${suffix}`;
    console.error(output, errorArg ?? '');
    window.financeShell?.events?.emit('log.error', { message: `${message}${suffix}`, context });
  },
  warn: (message: string, ...args: unknown[]) => {
    const context = args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer');
    const callerInfo = getRendererCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const output = context ? `[${context}] ${message}${suffix}` : `${message}${suffix}`;
    console.warn(output, errorArg ?? '');
    window.financeShell?.events?.emit('log.warn', { message: `${message}${suffix}`, context });
  },
  info: (message: string, ...args: unknown[]) => {
    const context = args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer');
    const callerInfo = getRendererCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const output = context ? `[${context}] ${message}${suffix}` : `${message}${suffix}`;
    console.info(output, errorArg ?? '');
    window.financeShell?.events?.emit('log.info', { message: `${message}${suffix}`, context });
  },
  debug: (message: string, ...args: unknown[]) => {
    const context = args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer');
    const callerInfo = getRendererCallerInfo();
    const suffix = callerInfo ? `  ${callerInfo.file}:${callerInfo.line}` : '';
    const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
    const output = context ? `[${context}] ${message}${suffix}` : `${message}${suffix}`;
    console.debug(output, errorArg ?? '');
    window.financeShell?.events?.emit('log.debug', { message: `${message}${suffix}`, context });
  },
};

function getRendererCallerInfo(): { file: string; line: number } | null {
  const stack = new Error().stack;
  if (!stack) return null;
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    const match = line.match(/\(([^)]+):(\d+):\d+\)/);
    if (!match) continue;
    const fullPath = match[1];
    if (fullPath.endsWith('logger.ts')) continue;
    const file = fullPath.split(/[\\/]/).pop() ?? fullPath;
    return { file, line: parseInt(match[2], 10) };
  }
  return null;
}

export { rendererLogger };
