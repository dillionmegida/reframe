import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Trim Controls', () => {
  test('should have default trim covering full video duration', async () => {
    const { app, page } = await launchIntoEditor();

    const state = await getEditorState(page);
    expect(state.trim.start).toBe(0);
    expect(state.trim.end).toBe(30);

    await closeElectronApp(app);
  });

  test('should update trim start via store and clamp playhead', async () => {
    const { app, page } = await launchIntoEditor();

    // Set playhead to 2s
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setCurrentTime(2);
    });

    // Set trim start to 5s — playhead at 2s should clamp to 5s
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setTrimStart(5);
    });

    const state = await getEditorState(page);
    expect(state.trim.start).toBe(5);
    expect(state.currentTime).toBeGreaterThanOrEqual(5);

    await closeElectronApp(app);
  });

  test('should update trim end via store and clamp playhead', async () => {
    const { app, page } = await launchIntoEditor();

    // Seek to 25s
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setCurrentTime(25);
    });

    // Set trim end to 20s — playhead at 25s should clamp to 20s
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setTrimEnd(20);
    });

    const state = await getEditorState(page);
    expect(state.trim.end).toBe(20);
    expect(state.currentTime).toBeLessThanOrEqual(20);

    await closeElectronApp(app);
  });

  test('should filter keyframes outside trim range when trim start moves', async () => {
    const { app, page } = await launchIntoEditor();

    // Add keyframes at t=2 and t=8
    await page.evaluate(() => {
      const store = (window as any).__editorStore.getState();
      store.addOrUpdateKeyframe({ timestamp: 2, x: 0.3, y: 0.3, scale: 1, easing: 'linear' });
      store.addOrUpdateKeyframe({ timestamp: 8, x: 0.7, y: 0.7, scale: 1, easing: 'linear' });
    });

    let state = await getEditorState(page);
    // 1 seed + 2 new = 3
    expect(state.keyframes.length).toBe(3);

    // Move trim start to 5s — keyframes at t=0 and t=2 should be filtered out
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setTrimStart(5);
    });

    state = await getEditorState(page);
    expect(state.trim.start).toBe(5);
    // Only keyframe at t=8 remains
    expect(state.keyframes.length).toBe(1);
    expect(state.keyframes[0].timestamp).toBe(8);

    await closeElectronApp(app);
  });

  test('should filter keyframes outside trim range when trim end moves', async () => {
    const { app, page } = await launchIntoEditor();

    // Add keyframes at t=10 and t=25
    await page.evaluate(() => {
      const store = (window as any).__editorStore.getState();
      store.addOrUpdateKeyframe({ timestamp: 10, x: 0.5, y: 0.5, scale: 1, easing: 'linear' });
      store.addOrUpdateKeyframe({ timestamp: 25, x: 0.8, y: 0.8, scale: 1, easing: 'linear' });
    });

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(3);

    // Move trim end to 15s — keyframe at t=25 should be filtered out
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setTrimEnd(15);
    });

    state = await getEditorState(page);
    expect(state.trim.end).toBe(15);
    // Seed kf at t=0 + kf at t=10 remain
    expect(state.keyframes.length).toBe(2);
    expect(state.keyframes.every((kf: any) => kf.timestamp <= 15)).toBe(true);

    await closeElectronApp(app);
  });

  test('should enforce minimum 0.5s gap between trim start and end', async () => {
    const { app, page } = await launchIntoEditor();

    // Try to set trim start very close to trim end
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setTrimStart(29.8);
    });

    const state = await getEditorState(page);
    // trim start should be clamped to trim.end - 0.5 = 29.5
    expect(state.trim.start).toBeLessThanOrEqual(29.5);
    expect(state.trim.end - state.trim.start).toBeGreaterThanOrEqual(0.5);

    await closeElectronApp(app);
  });

  test('should clamp arrow key seeking within trim range', async () => {
    const { app, page } = await launchIntoEditor();

    // Set trim to 5-25s
    await page.evaluate(() => {
      const store = (window as any).__editorStore.getState();
      store.setTrimStart(5);
      store.setTrimEnd(25);
    });

    // Try to seek before trim start
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setCurrentTime(5);
    });
    await page.keyboard.press('ArrowLeft');

    let state = await getEditorState(page);
    expect(state.currentTime).toBeGreaterThanOrEqual(5);

    // Try to seek past trim end
    await page.evaluate(() => {
      (window as any).__editorStore.getState().setCurrentTime(25);
    });
    await page.keyboard.press('ArrowRight');

    state = await getEditorState(page);
    expect(state.currentTime).toBeLessThanOrEqual(25);

    await closeElectronApp(app);
  });

  test('trim changes should be undoable', async () => {
    const { app, page } = await launchIntoEditor();

    let state = await getEditorState(page);
    expect(state.trim.start).toBe(0);

    await page.evaluate(() => {
      (window as any).__editorStore.getState().setTrimStart(5);
    });

    state = await getEditorState(page);
    expect(state.trim.start).toBe(5);

    // Undo
    await page.keyboard.press('Meta+z');

    state = await getEditorState(page);
    expect(state.trim.start).toBe(0);

    await closeElectronApp(app);
  });
});
