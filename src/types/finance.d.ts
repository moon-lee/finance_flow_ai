/**
 * Public Finance platform contracts shared by Core, Extension Host, and extensions.
 *
 * The manifest type is the source of truth for what an extension may declare.
 * Runtime validation lives in `src/extension-host/manifest-schema.ts` (Zod).
 * If you change a type here, mirror the change in the Zod schema.
 */

export type ActivationEvent =
  | '*'
  | `onView:${string}`
  | `onCommand:${string}`;

export interface ManifestViewContribution {
  /** Stable view id used for activation events and Navigation Panel grouping. */
  id: string;
  /** Human-readable label shown in the Activity Bar tooltip and Navigation Panel header. */
  name: string;
  /** Single-character or short icon label rendered in the Activity Bar button. */
  icon: string;
}

export interface ManifestCommandContribution {
  /** Stable command id; must be unique across all installed extensions. */
  id: string;
  /** Human-readable title shown in the Command Palette. */
  title: string;
  /**
   * Optional keyboard shortcut binding in Electron `accelerator` form
   * (e.g. `Ctrl+Shift+S`). Not enforced in Phase 3; registered for Phase 7.
   */
  keybinding?: string;
}

export interface ManifestMenuContribution {
  command: string;
  /** Grouping label in the top menu bar (e.g. "File", "View", "Salary"). */
  group: string;
  /** Optional sort key within the group. */
  order?: number;
}

export interface ManifestConfigurationContribution {
  /** Full settings key in `extensionId.localKey` form. */
  key: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  label: string;
  default?: unknown;
  /** Required for `enum` type. */
  enumOptions?: string[];
}

export interface ManifestContributions {
  views?: ManifestViewContribution[];
  commands?: ManifestCommandContribution[];
  menus?: ManifestMenuContribution[];
  configuration?: ManifestConfigurationContribution[];
}

export interface FinanceExtensionManifest {
  /** Globally unique extension id (e.g. `salary-history`). Must match `package.json#name`. */
  id: string;
  displayName: string;
  /** Semver version string. */
  version: string;
  /** Short description, shown in the Extension Manager UI (Phase 8). */
  description?: string;
  /** Optional list of other extension ids this extension depends on. */
  dependencies?: string[];
  /**
   * Activation events that cause this extension's code to be loaded.
   * `*` activates immediately on app start (use sparingly).
   */
  activationEvents: ActivationEvent[];
  contributions: ManifestContributions;
  /** Path to the extension's CommonJS or ESM entry relative to its package root. */
  main: string;
}

/**
 * The shape of the `financeExtension` field inside an extension's `package.json`.
 * Mirrors `FinanceExtensionManifest` — kept separate so package authors do not
 * need to import the full Core type to write a manifest.
 */
export interface PackageJsonFinanceExtension extends Omit<FinanceExtensionManifest, 'version'> {
  version?: string; // falls back to package.json#version if omitted
}
