import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Stabilization', () => {
  test('stabilization should be off by default', async () => {
    const { app, page } = await launchIntoEditor();

    const state = await getEditorState(page);
    // Default: no stabilization or disabled
    expect(state.stabilization?.enabled ?? false).toBe(false);

    await closeElectronApp(app);
  });

  test('should toggle stabilization on via button', async () => {
    const { app, page } = await launchIntoEditor();

    // Click Stabilize button
    await page.click('button:has-text("Stabilize")');

    const state = await getEditorState(page);
    expect(state.stabilization.enabled).toBe(true);

    await closeElectronApp(app);
  });

  test('should toggle stabilization off', async () => {
    const { app, page } = await launchIntoEditor();

    // Toggle on
    await page.click('button:has-text("Stabilize")');
    let state = await getEditorState(page);
    expect(state.stabilization.enabled).toBe(true);

    // Toggle off
    await page.click('button:has-text("Stabilize")');
    state = await getEditorState(page);
    expect(state.stabilization.enabled).toBe(false);

    await closeElectronApp(app);
  });

  test('stabilization should have default smoothing value', async () => {
    const { app, page } = await launchIntoEditor();

    await page.click('button:has-text("Stabilize")');

    const state = await getEditorState(page);
    expect(state.stabilization.enabled).toBe(true);
    expect(state.stabilization.smoothing).toBe(10);

    await closeElectronApp(app);
  });

  test('stabilization state persists across toggle cycles', async () => {
    const { app, page } = await launchIntoEditor();

    // Toggle on, then off, then on again
    await page.click('button:has-text("Stabilize")');
    await page.click('button:has-text("Stabilize")');
    await page.click('button:has-text("Stabilize")');

    const state = await getEditorState(page);
    expect(state.stabilization.enabled).toBe(true);

    await closeElectronApp(app);
  });
});
