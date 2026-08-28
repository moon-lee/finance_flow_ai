/** Public extension API for Finance Flow AI (vendored, self-contained). */
export interface FinanceApi {
  commands: {
    registerCommand(id: string, title: string, handler: (...args: unknown[]) => unknown, keybinding?: string): void;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
  };
  ai: { registerTool(def: { name: string; description: string; parameters?: unknown; handler: (args: unknown) => Promise<unknown> | unknown }): void };
  db: {
    table(name: string): {
      find(query?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
      findOne(query?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      count(query?: Record<string, unknown>): Promise<number>;
      insert(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
      update(where: Record<string, unknown>, payload: Record<string, unknown>): Promise<number>;
      delete(where: Record<string, unknown>): Promise<number>;
    };
  };
  services: { register(serviceName: string, impl: Record<string, (...args: unknown[]) => unknown>): void; unregister(serviceName: string): void; invoke<T = unknown>(serviceName: string, method: string, params?: unknown): Promise<T | null> };
  ui?: { requestMount(viewId: string, mountData?: object): Promise<void>; navigatePanel(view: string, mountData?: object): Promise<void>; setDirty(dirty: boolean): void; autoSaveDraft(): Promise<void>; onBeforeUnmount(cb: () => Promise<unknown>): void };
  events?: { on(topic: string, handler: (payload: unknown) => void): () => void; off(topic: string, handler: (payload: unknown) => void): void; emit(topic: string, payload: unknown): Promise<void> };
  settings?: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
}
export type ActivationEvent = '*' | 'onStartup' | `onView:${string}` | `onCommand:${string}`;
export type ColumnType = 'integer' | 'real' | 'text' | 'date' | 'datetime' | 'boolean';
export interface ColumnManifest { name: string; type: ColumnType; nullable?: boolean; default?: string | number | boolean; min?: number; max?: number; enumOptions?: string[]; }
export interface TableManifest { name: string; columns: ColumnManifest[]; }
export interface ManifestViewContribution { id: string; name: string; icon: string; openCommand?: string; }
export interface ManifestCommandContribution { id: string; title: string; keybinding?: string; }
export interface ManifestMenuContribution { command: string; group: string; order?: number; }
export interface ManifestConfigurationContribution { key: string; type: 'string' | 'number' | 'boolean' | 'enum' | 'object'; label: string; default?: unknown; enumOptions?: string[]; pattern?: string; formatHint?: string; placeholder?: string; }
export interface ManifestNavigationContribution { id: string; label: string; command: string; group?: string; icon?: string; }
export interface ManifestContributions { views?: ManifestViewContribution[]; commands?: ManifestCommandContribution[]; menus?: ManifestMenuContribution[]; configuration?: ManifestConfigurationContribution[]; navigation?: ManifestNavigationContribution[]; allowedCommands?: string[]; allowedUiEvents?: string[]; }
export interface FinanceExtensionManifest { id: string; displayName: string; version: string; description?: string; dependencies?: string[]; activationEvents: ActivationEvent[]; contributions: ManifestContributions; tables?: readonly TableManifest[]; main: string; keepAlive?: boolean; }
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare class ExtensionLogger { constructor(context: string); info(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void; debug(...a: unknown[]): void; }
