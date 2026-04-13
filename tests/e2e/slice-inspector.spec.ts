import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Slice Inspector', () => {
  test('should show slice actions when slice is selected', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice (auto-selected)
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.slices.length).toBe(1);
    expect(state.selectedSliceId).not.toBeNull();

    // Slice actions should be visible — Keep and Hide buttons
    await expect(page.locator('button:has-text("Keep")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Hide")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Delete")').first()).toBeVisible();

    await closeElectronApp(app);
  });

  test('should change slice status to hidden', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.slices[0].status).toBe('keep');

    // Click Hide button
    await page.click('button:has-text("Hide")');

    state = await getEditorState(page);
    expect(state.slices[0].status).toBe('hidden');

    await closeElectronApp(app);
  });

  test('should change slice status back to keep', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice and hide it
    await page.keyboard.press('s');
    await page.click('button:has-text("Hide")');

    let state = await getEditorState(page);
    expect(state.slices[0].status).toBe('hidden');

    // Click Keep button to restore
    await page.click('button:has-text("Keep")');

    state = await getEditorState(page);
    expect(state.slices[0].status).toBe('keep');

    await closeElectronApp(app);
  });

  test('export button should reflect only keep slices', async () => {
    const { app, page } = await launchIntoEditor();

    // Create two slices
    await page.keyboard.press('s');
    await page.keyboard.press('Escape');
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('s');

    const exportBtn = page.locator('[data-testid="export-button"]');
    await expect(exportBtn).toHaveText('Export 2 Slices');

    // Hide the second slice (currently selected)
    await page.click('button:has-text("Hide")');

    // Export button should now say 1 slice
    await expect(exportBtn).toHaveText('Export 1 Slice');

    await closeElectronApp(app);
  });

  test('hidden slice should show hidden label', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice and hide it
    await page.keyboard.press('s');
    await page.click('button:has-text("Hide")');

    // "hidden" label should appear in the timeline
    await expect(page.locator('text=hidden').first()).toBeVisible();

    await closeElectronApp(app);
  });

  test('should delete slice via inline Delete button', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice (auto-selected, actions visible)
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.slices.length).toBe(1);

    // Click Delete in slice actions
    await page.click('button:has-text("Delete")');

    state = await getEditorState(page);
    expect(state.slices.length).toBe(0);
    expect(state.selectedSliceId).toBeNull();

    await closeElectronApp(app);
  });

  test('should adjust slice start/end via store', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    const sliceId = state.slices[0].id;
    const originalStart = state.slices[0].start;
    const originalEnd = state.slices[0].end;

    // Update slice boundaries via store (simulates handle drag)
    await page.evaluate((id) => {
      (window as any).__editorStore.getState().updateSlice(id, { start: 2, end: 12 });
    }, sliceId);

    state = await getEditorState(page);
    expect(state.slices[0].start).toBe(2);
    expect(state.slices[0].end).toBe(12);

    await closeElectronApp(app);
  });

  test('slice boundary change should be undoable', async () => {
    const { app, page } = await launchIntoEditor();

    await page.keyboard.press('s');

    let state = await getEditorState(page);
    const sliceId = state.slices[0].id;
    const originalStart = state.slices[0].start;

    // Update slice via store
    await page.evaluate((id) => {
      (window as any).__editorStore.getState().updateSlice(id, { start: 5 });
    }, sliceId);

    state = await getEditorState(page);
    expect(state.slices[0].start).toBe(5);

    // Undo
    await page.keyboard.press('Meta+z');

    state = await getEditorState(page);
    expect(state.slices[0].start).toBeCloseTo(originalStart, 0);

    await closeElectronApp(app);
  });
});
