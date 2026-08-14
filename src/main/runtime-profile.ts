import { dirname, join } from 'node:path';

export const PRODUCT_APP_NAME = 'Finance Flow AI';
export const DEVELOPMENT_APP_NAME = 'Finance Flow AI Dev';

export interface RuntimeProfileInput {
  isPackaged: boolean;
  executablePath: string;
  resourcesPath: string;
  sourceExtensionsPath: string;
}

export interface RuntimeProfile {
  appName: string;
  /** Set only for the packaged product before Electron reads `userData`. */
  userDataPath?: string;
  extensionsPath: string;
}

/**
 * Resolves the process-level storage and extension locations before the app
 * opens SQLite. The result is deliberately independent of Electron so the
 * product/development boundary can be unit-tested without starting the app.
 *
 * ADR-0007: the packaged product owns a visible `data` directory beside its
 * executable; development retains a separate Electron profile by name.
 */
export function resolveRuntimeProfile(input: RuntimeProfileInput): RuntimeProfile {
  if (input.isPackaged) {
    return {
      appName: PRODUCT_APP_NAME,
      userDataPath: join(dirname(input.executablePath), 'data'),
      extensionsPath: join(input.resourcesPath, 'extensions'),
    };
  }

  return {
    appName: DEVELOPMENT_APP_NAME,
    extensionsPath: input.sourceExtensionsPath,
  };
}
