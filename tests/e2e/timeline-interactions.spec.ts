import { test, expect } from '@playwright/test';
import { launchIntoEditor, closeElectronApp, getEditorState } from './helpers';

test.describe('Timeline Interactions', () => {
  test('should select keyframe with Cmd+click for multi-select', async () => {
    const { app, page } = await launchIntoEditor();

    // Add two keyframes at different times
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(3);

    // Click first non-seed keyframe
    const dots = page.locator('[data-keyframe-dot]');
    await dots.nth(1).click({ force: true });

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(1);

    // Cmd+click second keyframe to add to selection
    await dots.nth(2).click({ force: true, modifiers: ['Meta'] });

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(2);

    await closeElectronApp(app);
  });

  test('should deselect keyframe with Cmd+click on already selected', async () => {
    const { app, page } = await launchIntoEditor();

    // Add a keyframe
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    const kfIds = state.keyframes.map((kf: any) => kf.id);

    // Select first, then Cmd+click second via store (what the click handler calls)
    await page.evaluate((ids) => {
      const store = (window as any).__editorStore.getState();
      store.toggleKeyframeSelection(ids[0], false, false); // single select
      store.toggleKeyframeSelection(ids[1], true, false);  // cmd+click to add
    }, kfIds);

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(2);

    // Cmd+click first to deselect
    await page.evaluate((id) => {
      (window as any).__editorStore.getState().toggleKeyframeSelection(id, true, false);
    }, kfIds[0]);

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(1);

    await closeElectronApp(app);
  });

  test('should range-select keyframes with Shift+click', async () => {
    const { app, page } = await launchIntoEditor();

    // Add keyframes at 5s, 10s, 15s
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.up('Shift');
      await page.keyboard.press('k');
    }

    let state = await getEditorState(page);
    // 1 seed + 3 new = 4
    expect(state.keyframes.length).toBe(4);

    const kfIds = state.keyframes.map((kf: any) => kf.id);

    // Select first keyframe, then Shift+click last via store
    await page.evaluate((ids) => {
      const store = (window as any).__editorStore.getState();
      store.toggleKeyframeSelection(ids[0], false, false);           // single select first
      store.toggleKeyframeSelection(ids[ids.length - 1], false, true); // shift+click last
    }, kfIds);

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(4);

    await closeElectronApp(app);
  });

  test('should show multi-keyframe inspector when multiple selected', async () => {
    const { app, page } = await launchIntoEditor();

    // Add two keyframes
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    const dots = page.locator('[data-keyframe-dot]');

    // Select first, then Cmd+click second
    await dots.nth(1).click({ force: true });
    await dots.nth(2).click({ force: true, modifiers: ['Meta'] });

    let state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(2);

    // Multi-keyframe inspector should show "Selected" label with count
    await expect(page.locator('text=2 keyframes')).toBeVisible();

    await closeElectronApp(app);
  });

  test('should batch-change easing for multi-selected keyframes', async () => {
    const { app, page } = await launchIntoEditor();

    // Add two keyframes
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    const dots = page.locator('[data-keyframe-dot]');

    // Multi-select
    await dots.nth(1).click({ force: true });
    await dots.nth(2).click({ force: true, modifiers: ['Meta'] });

    let state = await getEditorState(page);
    const selectedIds = state.selectedKeyframeIds;

    // Click Ease In-Out in multi-inspector
    await page.click('button[title="In-Out"]');

    state = await getEditorState(page);
    for (const id of selectedIds) {
      const kf = state.keyframes.find((k: any) => k.id === id);
      expect(kf.easing).toBe('ease-in-out');
    }

    await closeElectronApp(app);
  });

  test('should delete all selected keyframes with Backspace', async () => {
    const { app, page } = await launchIntoEditor();

    // Add two keyframes
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(3);

    const dots = page.locator('[data-keyframe-dot]');

    // Multi-select the two added keyframes
    await dots.nth(1).click({ force: true });
    await dots.nth(2).click({ force: true, modifiers: ['Meta'] });

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(2);

    // Delete all selected
    await page.keyboard.press('Backspace');

    state = await getEditorState(page);
    // Only seed keyframe remains
    expect(state.keyframes.length).toBe(1);
    expect(state.selectedKeyframeIds.length).toBe(0);

    await closeElectronApp(app);
  });

  test('should clone single selected keyframe with C key', async () => {
    const { app, page } = await launchIntoEditor();

    // Add keyframe at 5s
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await page.keyboard.press('k');

    let state = await getEditorState(page);
    expect(state.keyframes.length).toBe(2);

    // Select the keyframe at ~5s
    const dots = page.locator('[data-keyframe-dot]');
    await dots.last().click({ force: true });

    state = await getEditorState(page);
    expect(state.selectedKeyframeIds.length).toBe(1);

    // Press C to clone
    await page.keyboard.press('c');

    state = await getEditorState(page);
    expect(state.keyframes.length).toBe(3);

    await closeElectronApp(app);
  });
});
