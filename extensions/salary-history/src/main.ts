/**
 * Phase 3 stub for the salary-history extension. Registers two commands
 * with the finance.commands API. Phase 4 replaces this body with payslip
 * forms, validation, and persistence.
 */
export async function activate(finance: {
  commands: {
    registerCommand(id: string, title: string, handler: (...args: unknown[]) => unknown, keybinding?: string): void;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };
}): Promise<void> {
  finance.commands.registerCommand('salary.show-pay-history', 'View: Pay History', () => {
    console.log('[salary-history] Pay History view requested');
    // Phase 4 will open the payslip form here.
    return { executed: true };
  });

  finance.commands.registerCommand('salary.show-deductions', 'View: Deductions', () => {
    console.log('[salary-history] Deductions view requested');
    return { executed: true };
  });
}

export function deactivate(): void {
  // Phase 4 will dispose of any listeners or active forms here.
}
