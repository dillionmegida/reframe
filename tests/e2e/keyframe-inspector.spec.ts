import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Keyframe Inspector', () => {
  test('should open inspector when clicking a keyframe dot', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe at ~5s
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    // Click the keyframe dot to select it
    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    let state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(1);

    // Inspector popover should be visible with easing buttons
    await expect(page.getByText('Easing', { exact: true })).toBeVisible();
    await expect(page.getByText('Scale', { exact: true })).toBeVisible();
    await expect(page.getByText('Time', { exact: true })).toBeVisible();

    await closeElectronApp(app);
  });

  test('should change easing type via inspector buttons', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    // Select it
    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    let state = await getEditorState(page);
    const kfId = state.selectedKeyframeIds[0];
    const kf = state.keyframes.find((k: any) => k.id === kfId);
    // Default easing from K key is 'linear' (set by addOrUpdateKeyframe with easing override)
    expect(kf.easing).toBeDefined();

    // Click the Ease In button (second easing button, title="Ease In")
    await page.click('button[title="Ease In"]');

    state = await getEditorState(page);
    const updatedKf = state.keyframes.find((k: any) => k.id === kfId);
    expect(updatedKf.easing).toBe('ease-in');

    // Click Ease Out
    await page.click('button[title="Ease Out"]');

    state = await getEditorState(page);
    const updatedKf2 = state.keyframes.find((k: any) => k.id === kfId);
    expect(updatedKf2.easing).toBe('ease-out');

    await closeElectronApp(app);
  });

  test('should toggle explicit scale checkbox', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    // Select it
    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    let state = await getEditorState(page);
    const kfId = state.selectedKeyframeIds[0];

    // Check the "Include Scale in Keyframe" checkbox
    const checkbox = page.locator('text=Include Scale in Keyframe').locator('..').locator('input[type="checkbox"]');
    await checkbox.check({ force: true });

    state = await getEditorState(page);
    const kf = state.keyframes.find((k: any) => k.id === kfId);
    expect(kf.explicitScale).toBe(true);

    // Uncheck it
    await checkbox.uncheck({ force: true });

    state = await getEditorState(page);
    const kf2 = state.keyframes.find((k: any) => k.id === kfId);
    expect(kf2.explicitScale).toBe(false);

    await closeElectronApp(app);
  });

  test('should delete keyframe via inspector Delete button', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a second keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    // Select the new keyframe
    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    // Click Delete in inspector
    await page.click('button:has-text("Delete")');

    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(1);
    expect(state.selectedKeyframeIds.length).toBe(0);

    await closeElectronApp(app);
  });

  test('should clone keyframe to -1s via inspector', async () => {
    const { app, page } = await launchIntoEditor();

    // Seek to 5s and add keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    // Select the new keyframe at ~5s
    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    // Click "Clone to -1s"
    await page.click('button:has-text("Clone to -1s")');

    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(3);

    // New clone should be at ~4s (5s - 1s)
    const timestamps = state.keyframes.map((kf: any) => kf.timestamp).sort((a: number, b: number) => a - b);
    expect(timestamps[1]).toBeCloseTo(4, 0);

    await closeElectronApp(app);
  });

  test('should close inspector on Escape', async () => {
    const { app, page } = await launchIntoEditor();

    // Add and select a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    let state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(1);

    // Escape closes inspector
    await page.keyboard.press('Escape');

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(0);

    // Inspector labels should be gone
    await expect(page.locator('text=Easing')).not.toBeVisible();

    await closeElectronApp(app);
  });

  test('easing change should be undoable', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    let state = await getEditorState(page);
    const kfId = state.selectedKeyframeIds[0];
    const originalEasing = state.keyframes.find((k: any) => k.id === kfId).easing;

    // Change easing
    await page.click('button[title="Ease In-Out"]');
    state = await getEditorState(page);
    expect(state.keyframes.find((k: any) => k.id === kfId).easing).toBe('ease-in-out');

    // Deselect first so Escape doesn't interfere
    await page.keyboard.press('Escape');

    // Undo
    await page.keyboard.press('Meta+z');

    state = await getEditorState(page);
    const kfAfterUndo = state.keyframes.find((k: any) => k.id === kfId);
    expect(kfAfterUndo.easing).toBe(originalEasing);

    await closeElectronApp(app);
  });
});
