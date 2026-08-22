const rendererLogger = {
  log: (message: string, ...args: unknown[]) => {
    window.financeShell?.events?.emit('log.info', { message, context: args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer') });
  },
  error: (message: string, ...args: unknown[]) => {
    window.financeShell?.events?.emit('log.error', { message, context: args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer') });
  },
  warn: (message: string, ...args: unknown[]) => {
    window.financeShell?.events?.emit('log.warn', { message, context: args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer') });
  },
  info: (message: string, ...args: unknown[]) => {
    window.financeShell?.events?.emit('log.info', { message, context: args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer') });
  },
  debug: (message: string, ...args: unknown[]) => {
    window.financeShell?.events?.emit('log.debug', { message, context: args[0] instanceof Error ? undefined : String(args[0] ?? 'renderer') });
  },
};

export { rendererLogger };
