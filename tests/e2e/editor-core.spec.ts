import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Editor Core', () => {
  test('should load into editor with seeded project and video', async () => {
    const { app, page } = await launchIntoEditor();

    const state = await getEditorState(page);
    expect(state).not.toBeNull();
    expect(state.hasProject).toBe(true);
    expect(state.keyframes.length).toBe(1);
    expect(state.trim.start).toBe(0);
    expect(state.trim.end).toBe(30);
    expect(state.outputRatio).toBe('9:16');

    await closeElectronApp(app);
  });

  test('should show timeline, toolbar, and playback controls', async () => {
    const { app, page } = await launchIntoEditor();

    await expect(page.locator('[data-testid="timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="play-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="undo-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="redo-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-button"]')).toBeVisible();

    await closeElectronApp(app);
  });

  test('should add a keyframe with K key', async () => {
    const { app, page } = await launchIntoEditor();

    // Start with 1 seed keyframe at t=0
    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(1);

    // Seek forward so K creates a new keyframe (not updating the one at t=0)
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Press K to add keyframe at current time
    await page.keyboard.press('k');

    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    await closeElectronApp(app);
  });

  test('should add multiple keyframes at different times', async () => {
    const { app, page } = await launchIntoEditor();

    // Seek to ~5s and add keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    // Seek further (+5s) and add another
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    const state = await getEditorState(page);
    // 1 seed + 2 new = 3 (seed kf at t=0 stays since we seeked away)
    expect(state.keyframes.length).toBe(3);

    await closeElectronApp(app);
  });

  test('should delete selected keyframe with Backspace', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a second keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    // Click on the keyframe dot to select it (force to bypass overlay)
    const kfDot = page.locator('[data-keyframe-dot]').last();
    await kfDot.click({ force: true });

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(1);

    // Delete it
    await page.keyboard.press('Backspace');

    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(1);
    expect(state.selectedKeyframeIds.length).toBe(0);

    await closeElectronApp(app);
  });

  test('should seek forward and backward with arrow keys', async () => {
    const { app, page } = await launchIntoEditor();

    let state = await getEditorState(page);
    const initialTime = state.currentTime;

    // Step forward one frame (ArrowRight = +1/30s)
    await page.keyboard.press('ArrowRight');
    state = await getEditorState(page);
    expect(state.currentTime).toBeGreaterThan(initialTime);

    const afterForward = state.currentTime;

    // Step backward one frame
    await page.keyboard.press('ArrowLeft');
    state = await getEditorState(page);
    expect(state.currentTime).toBeLessThan(afterForward);

    await closeElectronApp(app);
  });

  test('should seek by 5s with Shift+Arrow', async () => {
    const { app, page } = await launchIntoEditor();

    let state = await getEditorState(page);
    const initialTime = state.currentTime;

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    state = await getEditorState(page);
    expect(state.currentTime).toBeCloseTo(initialTime + 5, 0);

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    state = await getEditorState(page);
    expect(state.currentTime).toBeCloseTo(initialTime, 0);

    await closeElectronApp(app);
  });

  test('should toggle play/pause with Space', async () => {
    const { app, page } = await launchIntoEditor();

    let state = await getEditorState(page);
    expect(state.isPlaying).toBe(false);

    await page.keyboard.press('Space');
    state = await getEditorState(page);
    expect(state.isPlaying).toBe(true);

    await page.keyboard.press('Space');
    state = await getEditorState(page);
    expect(state.isPlaying).toBe(false);

    await closeElectronApp(app);
  });

  test('should deselect everything with Escape', async () => {
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

    // Escape deselects
    await page.keyboard.press('Escape');
    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(0);

    await closeElectronApp(app);
  });

  test('should change output ratio via toolbar buttons', async () => {
    const { app, page } = await launchIntoEditor();

    let state = await getEditorState(page);
    expect(state.outputRatio).toBe('9:16');

    // Click the 1:1 ratio button
    await page.click('button:has-text("1:1")');
    state = await getEditorState(page);
    expect(state.outputRatio).toBe('1:1');

    // Click the 4:5 ratio button
    await page.click('button:has-text("4:5")');
    state = await getEditorState(page);
    expect(state.outputRatio).toBe('4:5');

    // Back to 9:16
    await page.click('button:has-text("9:16")');
    state = await getEditorState(page);
    expect(state.outputRatio).toBe('9:16');

    await closeElectronApp(app);
  });
});
