import { expect, test } from '@playwright/test';

test.describe('Phase 1 renderer shell', () => {
  test('displays the core shell regions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#activity-bar')).toBeVisible();
    await expect(page.locator('#navigation-panel')).toBeVisible();
    await expect(page.locator('#workspace')).toBeVisible();
    await expect(page.locator('#ai-panel')).toBeVisible();
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

  test('collapses and restores the AI panel', async ({ page }) => {
    await page.goto('/');
    const app = page.locator('#app');
    await expect(app).not.toHaveClass(/ai-collapsed/);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
    await expect(app).toHaveClass(/ai-collapsed/);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
    await expect(app).not.toHaveClass(/ai-collapsed/);
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
