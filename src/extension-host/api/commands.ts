/**
 * Extension-side command registry. In Phase 3, registration is in-process;
 * Main is notified via an RPC notification so the Command Palette can list
 * commands contributed by this extension. Execution is a stub that logs
 * and returns `{ executed: true }`.
 */

export type CommandHandler = (...args: unknown[]) => Promise<unknown> | unknown;

interface RegisteredCommand {
  id: string;
  title: string;
  keybinding?: string;
  handler: CommandHandler;
}

const commands = new Map<string, RegisteredCommand>();

export function registerCommand(
  id: string,
  title: string,
  handler: CommandHandler,
  keybinding?: string
): void {
  if (commands.has(id)) {
    throw new Error(`Command "${id}" is already registered`);
  }
  commands.set(id, { id, title, handler, keybinding });
}

export async function executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
  const cmd = commands.get(id);
  if (!cmd) {
    // Graceful degradation: missing/unregistered commands return null, never throw.
    return null;
  }
  return cmd.handler(...args);
}

export function listCommands(): Array<{ id: string; title: string; keybinding?: string }> {
  return Array.from(commands.values()).map(({ id, title, keybinding }) => ({ id, title, keybinding }));
}

/** Test-only: reset the registry between unit tests. */
export function __resetCommandRegistry(): void {
  commands.clear();
}
