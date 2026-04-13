import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Export Flow', () => {
  test('should open export modal when clicking export with keep slices', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice so export is enabled
    await page.keyboard.press('s');
    await page.keyboard.press('Escape'); // deselect slice so Backspace won't interfere

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toBeEnabled();

    // Click export
    await exportBtn.click();

    // Export modal should appear
    await expect(page.locator('text=Exporting Slice')).toBeVisible({ timeout: 5000 });

    await closeElectronApp(app);
  });

  test('should show slice info in export modal', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice
    await page.keyboard.press('s');
    await page.keyboard.press('Escape');

    // Click export
    await page.locator('[data-testid="export-button"]').click();

    // Should show "Slice 1" label
    await expect(page.locator('text=Slice 1')).toBeVisible({ timeout: 5000 });

    await closeElectronApp(app);
  });

  test('should show multi-slice export title for multiple slices', async () => {
    const { app, page } = await launchIntoEditor();

    // Create two slices
    await page.keyboard.press('s');
    await page.keyboard.press('Escape');
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('s');
    await page.keyboard.press('Escape');

    // Click export
    await page.locator('[data-testid="export-button"]').click();

    // Should say "Exporting 2 Slices"
    await expect(page.locator('text=Exporting 2 Slices')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Slice 1')).toBeVisible();
    await expect(page.locator('text=Slice 2')).toBeVisible();

    await closeElectronApp(app);
  });

  test('should not export when no keep slices exist', async () => {
    const { app, page } = await launchIntoEditor();

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toBeDisabled();
    await expect(exportBtn).toHaveText('Export');

    await closeElectronApp(app);
  });

  test('export button disabled when all slices are hidden', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice and hide it
    await page.keyboard.press('s');
    await page.click('button:has-text("Hide")');

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toBeDisabled();

    await closeElectronApp(app);
  });

  test('should show cancel button during export', async () => {
    const { app, page } = await launchIntoEditor();

    // Override export-video to hang so we can see the in-progress state
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('export-video');
      ipcMain.handle('export-video', () => new Promise(() => {})); // never resolves
    });

    // Create a slice
    await page.keyboard.press('s');
    await page.keyboard.press('Escape');

    // Click export
    await page.locator('[data-testid="export-button"]').click();

    // Cancel All button should be visible during export
    await expect(page.locator('text=Cancel All')).toBeVisible({ timeout: 5000 });

    await closeElectronApp(app);
  });
});
