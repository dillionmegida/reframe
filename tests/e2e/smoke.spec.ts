import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers';

test.describe('Reframe App - Smoke Tests', () => {
  test('should launch app and show base path setup on first run', async () => {
    const { app, page } = await launchElectronApp();

    await expect(page.locator('text=Welcome to Reframe')).toBeVisible({ timeout: 10000 });

    await closeElectronApp(app);
  });

  test('should boot to main window', async () => {
    const { app, page } = await launchElectronApp();

    await page.waitForLoadState('domcontentloaded');
    
    const title = await app.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return windows[0]?.getTitle();
    });

    expect(title).toBeTruthy();

    await closeElectronApp(app);
  });
});
