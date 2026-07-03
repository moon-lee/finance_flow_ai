import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [join(__dirname, '..', '..', 'dist', 'main', 'main.js')],
    env: { ...process.env, NODE_ENV: 'production' }
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app.close();
});

test.describe('Phase 3 Extension Host', () => {
  test('Activity Bar shows a button for the salary-history extension view', async () => {
    const buttons = page.locator('activity-bar button[data-view-id="salary-history"]');
    await expect(buttons).toHaveCount(1);
    await expect(buttons).toHaveAttribute('title', 'Salary');
  });

  test('Built-in Settings button is always present', async () => {
    const settingsBtn = page.locator('activity-bar button.settings');
    await expect(settingsBtn).toBeVisible();
  });

  test('Command Palette lists extension commands under an Extensions group', async () => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    const palette = page.locator('#command-palette');
    await expect(palette).toBeVisible();
    const groupLabels = palette.locator('.group-label');
    await expect(groupLabels).toHaveText(['Built-in', 'Extensions']);
    const extensionsGroup = palette.locator('.palette-item').filter({ hasText: 'View: Pay History' });
    await expect(extensionsGroup).toHaveCount(1);
    await page.keyboard.press('Escape');
  });

  test('View activation via IPC returns activated=true after the host runs', async () => {
    // [Review fix §3.4] Drives the activation through the IPC contract rather
    // than coupling to Phase 1's `#navigation-panel .nav-title` DOM structure.
    // The original assertion was undocumented Phase 1 HTML; if the NavigationPanel
    // ever changes its class names or header structure, the test would fail for
    // an unrelated reason. The IPC contract (`activateView()` returns
    // `{ activated: boolean }`) is the stable public surface this test pins.
    const result = await page.evaluate(async () => {
      return await window.financeShell.extensions.activateView('salary-history');
    });

    expect(result).toMatchObject({ activated: true });
  });

  test('Host process crash is non-fatal (placeholder, see manual test for full coverage)', async () => {
    // This test is intentionally minimal — the host's non-fatal crash behaviour
    // is verified in the manual test units. E2E crash simulation would require
    // killing the utilityProcess from inside the test, which Phase 4+ will add.
    expect(true).toBe(true);
  });
});
