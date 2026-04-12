import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers';

test.describe('Reframe App - Project Workflow', () => {
  test('should create a project and navigate to it', async () => {
    const { app, page } = await launchElectronApp();

    await page.waitForSelector('[data-testid="new-project-button"]', { timeout: 10000 });
    
    await page.click('[data-testid="new-project-button"]');
    
    const input = page.locator('[data-testid="new-project-input"]');
    await input.waitFor({ state: 'visible' });
    await input.fill('Test Project');
    await input.press('Enter');

    await expect(page.locator('text=Test Project')).toBeVisible();

    await closeElectronApp(app);
  });

  test('should show welcome screen when no project is selected', async () => {
    const { app, page } = await launchElectronApp();

    await expect(page.locator('text=Welcome to Reframe')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Select a project from the sidebar or create a new one to get started.')).toBeVisible();

    await closeElectronApp(app);
  });
});
