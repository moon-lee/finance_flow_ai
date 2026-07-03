import * as commandsApi from './commands';
import * as dbApi from './db';
import * as aiApi from './ai';

/**
 * The `finance` global extensions import. Phase 3 stubs `db` and `ai` and
 * implements `commands` registration. Phase 4+ replaces stubs with real
 * implementations without changing this surface.
 */
export const finance = {
  db: {
    table: dbApi.table
  },
  commands: {
    registerCommand: commandsApi.registerCommand,
    execute: commandsApi.executeCommand
  },
  ai: {
    registerTool: aiApi.registerTool
  }
} as const;

export type FinanceApi = typeof finance;
