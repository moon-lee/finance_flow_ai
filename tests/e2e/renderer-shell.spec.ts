import { expect, test } from '@playwright/test';

test.describe('Phase 1 renderer shell', () => {
  test('displays the core shell regions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#activity-bar')).toBeVisible();
    await expect(page.locator('#navigation-panel')).toBeVisible();
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#status-bar')).toBeVisible();
  });

  test('uses the expected grid shell layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toHaveCSS('display', 'grid');
  });

  test('opens and closes the command palette', async ({ page }) => {
    await page.goto('/');
    const palette = page.locator('#command-palette');
    await expect(palette).toBeHidden();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    await expect(palette).toBeVisible();
    await expect(palette.locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('closes command palette on click outside', async ({ page }) => {
    await page.goto('/');
    const palette = page.locator('#command-palette');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
    await expect(palette).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(palette).toBeHidden();
  });

  test('switches sidebar navigation on activity bar click', async ({ page }) => {
    await page.goto('/');
    const navPanel = page.locator('#navigation-panel');
    await expect(navPanel.locator('h2')).toHaveText('Explorer');
    await expect(navPanel.locator('.nav-title').first()).toHaveText('Dashboard');
    const salaryButton = page.locator('activity-bar button').nth(1);
    await salaryButton.click();
    await expect(navPanel.locator('.nav-title').first()).toHaveText('Salary');
    await expect(navPanel.locator('.nav-item').first()).toHaveText('Pay History');
  });
});

test.describe('Phase 2 settings and theme', () => {
  // Reset persisted settings before each test so test order does not
  // matter. Without this, the second test to run may see state left by
  // the first (e.g. light-theme persisted from a prior toggle).
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await window.financeShell.settings.set('core.theme', 'dark');
    });
    await page.reload();
  });

  test('displays theme toggle button in status bar', async ({ page }) => {
    await page.goto('/');
    const statusBar = page.locator('#status-bar');
    const themeBtn = statusBar.locator('.status-btn[data-action="toggle-theme"]');
    await expect(themeBtn).toBeVisible();
  });

  test('toggles theme when clicking status bar button', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('body');
    const themeBtn = page.locator('.status-btn[data-action="toggle-theme"]');

    // Default is dark
    await expect(body).not.toHaveClass(/light-theme/);

    // Click to toggle to light
    await themeBtn.click();
    await expect(body).toHaveClass(/light-theme/);
    await expect(themeBtn).toContainText('Light');

    // Click to toggle back to dark
    await themeBtn.click();
    await expect(body).not.toHaveClass(/light-theme/);
    await expect(themeBtn).toContainText('Dark');
  });
});
