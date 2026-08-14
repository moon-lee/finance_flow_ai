import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_APP_NAME,
  PRODUCT_APP_NAME,
  resolveRuntimeProfile,
} from '../../../src/main/runtime-profile';

describe('resolveRuntimeProfile', () => {
  it('keeps packaged product data beside the executable and loads packaged manifests', () => {
    const profile = resolveRuntimeProfile({
      isPackaged: true,
      executablePath: 'D:\\Finance Flow Product\\Finance Flow AI.exe',
      resourcesPath: 'D:\\Finance Flow Product\\resources',
      sourceExtensionsPath: 'D:\\finance_flow_ai\\extensions',
    });

    expect(profile).toEqual({
      appName: PRODUCT_APP_NAME,
      userDataPath: 'D:\\Finance Flow Product\\data',
      extensionsPath: 'D:\\Finance Flow Product\\resources\\extensions',
    });
  });

  it('keeps development on a distinct Electron profile and source manifests', () => {
    const profile = resolveRuntimeProfile({
      isPackaged: false,
      executablePath: 'D:\\finance_flow_ai\\node_modules\\electron\\electron.exe',
      resourcesPath: 'D:\\finance_flow_ai\\node_modules\\electron\\dist\\resources',
      sourceExtensionsPath: 'D:\\finance_flow_ai\\extensions',
    });

    expect(profile).toEqual({
      appName: DEVELOPMENT_APP_NAME,
      extensionsPath: 'D:\\finance_flow_ai\\extensions',
    });
  });
});
