import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Slices', () => {
  test('should create a slice with S key', async () => {
    const { app, page } = await launchIntoEditor();

    let state = await getEditorState(page);
    expect(state.slices.length).toBe(0);

    // Press S to add a slice at current playhead position
    await page.keyboard.press('s');

    state = await getEditorState(page);
    expect(state.slices.length).toBe(1);
    expect(state.slices[0].status).toBe('keep');
    // Slice should be selected after creation
    expect(state.selectedSliceId).toBe(state.slices[0].id);

    await closeElectronApp(app);
  });

  test('should create a slice with default 5s duration', async () => {
    const { app, page } = await launchIntoEditor();

    // Seek to 10s
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');

    await page.keyboard.press('s');

    const state = await getEditorState(page);
    const slice = state.slices[0];
    expect(slice.start).toBeCloseTo(10, 0);
    expect(slice.end).toBeCloseTo(15, 0);

    await closeElectronApp(app);
  });

  test('should create multiple slices', async () => {
    const { app, page } = await launchIntoEditor();

    // Slice at 0s
    await page.keyboard.press('s');

    // Seek to 10s and add another
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('s');

    // Seek to 20s and add another
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('s');

    const state = await getEditorState(page);
    expect(state.slices.length).toBe(3);

    await closeElectronApp(app);
  });

  test('should delete selected slice with Backspace', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice (it auto-selects)
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.slices.length).toBe(1);
    expect(state.selectedSliceId).not.toBeNull();

    // Delete the selected slice
    await page.keyboard.press('Backspace');

    state = await getEditorState(page);
    expect(state.slices.length).toBe(0);
    expect(state.selectedSliceId).toBeNull();

    await closeElectronApp(app);
  });

  test('should deselect slice with Escape', async () => {
    const { app, page } = await launchIntoEditor();

    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.selectedSliceId).not.toBeNull();

    await page.keyboard.press('Escape');

    state = await getEditorState(page);
    expect(state.selectedSliceId).toBeNull();

    await closeElectronApp(app);
  });

  test('export button should be disabled when no slices exist', async () => {
    const { app, page } = await launchIntoEditor();

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toBeDisabled();
    await expect(exportBtn).toHaveText('Export');

    await closeElectronApp(app);
  });

  test('export button should be enabled when keep slice exists', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice (default status is 'keep')
    await page.keyboard.press('s');

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toBeEnabled();
    await expect(exportBtn).toHaveText('Export 1 Slice');

    await closeElectronApp(app);
  });

  test('export button text should reflect slice count', async () => {
    const { app, page } = await launchIntoEditor();

    // Create two slices
    await page.keyboard.press('s');
    await page.keyboard.press('Escape'); // deselect so Backspace won't delete
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('s');

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toHaveText('Export 2 Slices');

    await closeElectronApp(app);
  });

  test('slice at end of video should clamp to trim end', async () => {
    const { app, page } = await launchIntoEditor();

    // Seek close to the end (28s into a 30s video)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowRight'); // +5s each
      await page.keyboard.up('Shift');
    }
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await page.keyboard.press('s');

    const state = await getEditorState(page);
    const slice = state.slices[0];
    // Slice end should not exceed trim.end (30s)
    expect(slice.end).toBeLessThanOrEqual(30);

    await closeElectronApp(app);
  });
});
