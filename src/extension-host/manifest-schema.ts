import { z } from 'zod';
import type { FinanceExtensionManifest } from '../types/finance';

const activationEventSchema = z.union([
  z.literal('*'),
  z.string().regex(/^onView:[a-z0-9-]+$/, 'must match onView:<id>'),
  z.string().regex(/^onCommand:[a-z0-9.-]+$/, 'must match onCommand:<id>')
]);

export const viewContributionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'view id must be lowercase alphanumeric/hyphen'),
  name: z.string().min(1),
  icon: z.string().min(1).max(2)
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

export const manifestContributionsSchema = z.object({
  views: z.array(viewContributionSchema).optional(),
  commands: z.array(commandContributionSchema).optional(),
  menus: z.array(menuContributionSchema).optional(),
  configuration: z.array(configurationContributionSchema).optional()
}).strict(); // reject unknown contribution keys

export const financeExtensionManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'extension id must be lowercase alphanumeric/hyphen'),
  displayName: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  activationEvents: z.array(activationEventSchema).min(1, 'at least one activation event is required'),
  contributions: manifestContributionsSchema,
  main: z.string().min(1)
}).strict(); // reject unknown manifest keys

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
