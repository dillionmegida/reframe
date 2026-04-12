import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Undo / Redo', () => {
  test('undo button should be disabled initially', async () => {
    const { app, page } = await launchIntoEditor();

    const undoBtn = page.locator('[data-testid="undo-button"]');
    await expect(undoBtn).toBeDisabled();

    await closeElectronApp(app);
  });

  test('redo button should be disabled initially', async () => {
    const { app, page } = await launchIntoEditor();

    const redoBtn = page.locator('[data-testid="redo-button"]');
    await expect(redoBtn).toBeDisabled();

    await closeElectronApp(app);
  });

  test('should undo keyframe addition with Cmd+Z', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);
    expect(state.pastLength).toBeGreaterThan(0);

    // Undo
    await page.keyboard.press('Meta+z');

    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(1);
    expect(state.futureLength).toBeGreaterThan(0);

    await closeElectronApp(app);
  });

  test('should redo after undo with Cmd+Shift+Z', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    // Undo
    await page.keyboard.press('Meta+z');
    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(1);

    // Redo
    await page.keyboard.down('Shift');
    await page.keyboard.press('Meta+z');
    await page.keyboard.up('Shift');
    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    await closeElectronApp(app);
  });

  test('should undo slice creation', async () => {
    const { app, page } = await launchIntoEditor();

    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.slices.length).toBe(1);

    await page.keyboard.press('Meta+z');

    state = await getEditorState(page);
    expect(state.slices.length).toBe(0);

    await closeElectronApp(app);
  });

  test('should undo slice deletion', async () => {
    const { app, page } = await launchIntoEditor();

    // Create a slice (auto-selected)
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.slices.length).toBe(1);

    // Delete slice
    await page.keyboard.press('Backspace');
    state = await getEditorState(page);
    expect(state.slices.length).toBe(0);

    // Undo deletion
    await page.keyboard.press('Meta+z');
    state = await getEditorState(page);
    expect(state.slices.length).toBe(1);

    await closeElectronApp(app);
  });

  test('undo button should become enabled after an action', async () => {
    const { app, page } = await launchIntoEditor();

    const undoBtn = page.locator('[data-testid="undo-button"]');
    await expect(undoBtn).toBeDisabled();

    // Perform an action (add keyframe)
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    await expect(undoBtn).toBeEnabled();

    await closeElectronApp(app);
  });

  test('multiple undos should revert multiple actions', async () => {
    const { app, page } = await launchIntoEditor();

    // Add keyframe at ~5s
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    // Add slice
    await page.keyboard.press('s');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);
    expect(state.slices.length).toBe(1);

    // Undo slice creation
    await page.keyboard.press('Meta+z');
    state = await getEditorState(page);
    expect(state.slices.length).toBe(0);
    expect(state.keyframes.length).toBe(2);

    // Undo keyframe addition
    await page.keyboard.press('Meta+z');
    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(1);

    await closeElectronApp(app);
  });

  test('new action after undo should clear redo stack', async () => {
    const { app, page } = await launchIntoEditor();

    // Add keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    // Undo it
    await page.keyboard.press('Meta+z');
    let state = await getEditorState(page);
    expect(state.futureLength).toBeGreaterThan(0);

    // New action: add a slice (should clear redo)
    await page.keyboard.press('s');
    state = await getEditorState(page);
    expect(state.futureLength).toBe(0);

    await closeElectronApp(app);
  });
});
