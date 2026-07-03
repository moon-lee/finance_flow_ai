/**
 * Phase 3 ai stub. Tool registration stores the tool definition locally
 * and forwards it to Main via RPC notification so the AI Assistant panel
 * (Phase 6) can later resolve it. Phase 6 will add execution and the
 * LLM provider plumbing.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: unknown;
  handler: (args: unknown) => Promise<unknown> | unknown;
}

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (tools.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  tools.set(tool.name, tool);
}

export function listTools(): Array<{ name: string; description: string; parameters: unknown }> {
  return Array.from(tools.values()).map(({ name, description, parameters }) => ({ name, description, parameters }));
}

export async function invokeTool(name: string, args: unknown): Promise<unknown> {
  const tool = tools.get(name);
  if (!tool) return null;
  return tool.handler(args);
}

/** Test-only: reset the tool registry. */
export function __resetToolRegistry(): void {
  tools.clear();
}
