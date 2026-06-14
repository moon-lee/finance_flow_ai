export interface FinanceShellApi {
  getVersion: () => Promise<string>;
}

declare global {
  interface Window {
    financeShell: FinanceShellApi;
  }
}
