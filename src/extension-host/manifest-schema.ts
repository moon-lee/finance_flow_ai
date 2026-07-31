import { z } from 'zod';
import type { FinanceExtensionManifest, TableManifest, ColumnManifest } from '../types/finance';

const activationEventSchema = z.union([
  z.literal('*'),
  z.literal('onStartup'),
  z.string().regex(/^onView:[a-z0-9-]+$/, 'must match onView:<id>'),
  z.string().regex(/^onCommand:[a-z0-9.-]+$/, 'must match onCommand:<id>')
]);

export const viewContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'view id must be lowercase alphanumeric/hyphen'),
  name: z.string().min(1),
  icon: z.string().min(1).max(2),
  // Phase 5 Fix 3 — a Host-executed command that opens this view with current
  // data (see ManifestViewContribution.openCommand). Cross-checked against
  // commands[] in manifestContributionsSchema below.
  openCommand: z.string().regex(/^[a-z0-9.-]+$/, 'command id must be lowercase with dots/hyphens').optional()
});

export const commandContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/, 'command id must be lowercase with dots/hyphens'),
  title: z.string().min(1),
  keybinding: z.string().optional()
});

export const menuContributionSchema = z.object({
  command: z.string(),
  group: z.string().min(1),
  order: z.number().int().optional()
});

export const configurationContributionSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+\.[a-zA-Z0-9.-]+$/, 'configuration key must be "<extensionId>.<localKey>"'),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'object']),
  label: z.string().min(1),
  default: z.unknown().optional(),
  enumOptions: z.array(z.string()).optional()
}).refine(
  (cfg) => cfg.type !== 'enum' || (cfg.enumOptions && cfg.enumOptions.length > 0),
  { message: 'enum type requires enumOptions', path: ['enumOptions'] }
);

export const navigationContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'navigation id must be lowercase alphanumeric/hyphen'),
  label: z.string().min(1),
  command: z.string().min(1),
  group: z.string().optional()
});

export const manifestContributionsSchema = z.object({
  views: z.array(viewContributionSchema).optional(),
  commands: z.array(commandContributionSchema).optional(),
  menus: z.array(menuContributionSchema).optional(),
  configuration: z.array(configurationContributionSchema).optional(),
  navigation: z.array(navigationContributionSchema).optional(),
  allowedCommands: z.array(z.string().regex(/^[a-z0-9.-]+$/, 'command id must be lowercase with dots/hyphens')).optional(),
  allowedUiEvents: z.array(z.string().regex(/^[a-z0-9-]+$/, 'event name must be lowercase alphanumeric/hyphen')).optional()
}).strict() // reject unknown contribution keys
  .refine(
    (data) => {
      if (!data.navigation) return true;
      const ids = data.navigation.map((n) => n.id);
      return ids.length === new Set(ids).size;
    },
    { message: 'navigation items must have unique ids', path: ['navigation'] }
  )
  .refine(
    (data) => {
      if (!data.allowedCommands || !data.commands) return true;
      const commandIds = new Set(data.commands.map((c) => c.id));
      return data.allowedCommands.every((cmd) => commandIds.has(cmd));
    },
    { message: 'allowedCommands must reference commands defined in commands[]', path: ['allowedCommands'] }
  )
  .refine(
    (data) => {
      if (!data.allowedUiEvents) return true;
      return data.allowedUiEvents.length === new Set(data.allowedUiEvents).size;
    },
    { message: 'allowedUiEvents must not contain duplicate entries', path: ['allowedUiEvents'] }
  )
  .refine(
    (data) => {
      if (!data.views || !data.commands) return true;
      const commandIds = new Set(data.commands.map((c) => c.id));
      return data.views.every(
        (v) => !v.openCommand || commandIds.has(v.openCommand)
      );
    },
    {
      message: 'views[].openCommand must reference a command defined in commands[]',
      path: ['views']
    }
  );

// ---------------------------------------------------------------------------
// Table manifest schemas (Phase 4 Task 8 / Decision 3)
// ---------------------------------------------------------------------------

/**
 * Per-type Zod validator for `default` values. The interface in
 * `ColumnManifest` is permissive (`string | number | boolean`) — this
 * refinement checks that the supplied default is plausible for the
 * column's declared `type`. Catches obvious typos at load time
 * (e.g. defaulting a `boolean` column with a string).
 *
 * Note: the registry's `buildColumnZodSchema` (Task 2) does NOT do this
 * check — it trusts the manifest. Pushing the check here means a malformed
 * manifest is rejected at extension-load time, before any DAO call lands
 * on a corrupt column declaration.
 */
const defaultMatchesType = (
  data: { type: string; default?: string | number | boolean }
): boolean => {
  if (data.default === undefined) return true;
  switch (data.type) {
    case 'integer':
    case 'real':
      return typeof data.default === 'number';
    case 'text':
    case 'date':
      return typeof data.default === 'string';
    case 'datetime':
      // Accept any string (incl. the 'now' sentinel — Task 5 resolves it)
      // OR a number (epoch ms) for completeness.
      return typeof data.default === 'string' || typeof data.default === 'number';
    case 'boolean':
      return typeof data.default === 'boolean';
    default:
      return true;
  }
};

export const columnManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'column name must be lowercase snake_case starting with a letter'),
  type: z.enum(['integer', 'real', 'text', 'date', 'datetime', 'boolean']),
  nullable: z.boolean().optional(),
  primary: z.boolean().optional(),
  autoIncrement: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  index: z.boolean().optional(),
  references: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'references must be "<table>.<column>"').optional(),
  enumOptions: z.array(z.string().min(1)).optional(),
  description: z.string().optional()
}).strict().refine(defaultMatchesType, {
  message: 'default value does not match column type',
  path: ['default']
});

export const tableManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'table name must be lowercase snake_case starting with a letter'),
  columns: z.array(columnManifestSchema).min(1, 'a table must have at least one column')
}).strict();

export const financeExtensionManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'extension id must be lowercase alphanumeric/hyphen'),
  displayName: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  activationEvents: z.array(activationEventSchema).min(1, 'at least one activation event is required'),
  contributions: manifestContributionsSchema,
  tables: z.array(tableManifestSchema).optional(),
  main: z.string().min(1)
}).strict(); // reject unknown manifest keys

// Re-export the column/table manifest types alongside their schemas so
// extension authors have a single import path (`from 'finance'`) for
// both runtime validation and TypeScript types. The types remain
// defined in `shared-data-tables.ts` (the source of truth for the
// registry + DAO); these are type aliases, not duplicates.
export type { TableManifest, ColumnManifest };

export type ManifestValidationResult =
  | { ok: true; manifest: FinanceExtensionManifest }
  | { ok: false; errors: string[] };

export function validateManifest(raw: unknown): ManifestValidationResult {
  const result = financeExtensionManifestSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, manifest: result.data as FinanceExtensionManifest };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
  };
}
