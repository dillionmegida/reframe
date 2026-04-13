import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

export interface AppSeedData {
  basePath?: string | null;
  projects?: Array<{ id: string; name: string; createdAt: number }>;
  videos?: Array<Record<string, any>>;
}

/**
 * A mock video entry that can be used to seed the editor.
 * Uses a non-existent path — the <video> element will fail to load,
 * but all Zustand store / UI logic still works.
 */
export const MOCK_PROJECT = {
  id: 'test-project-1',
  name: 'Test Project',
  createdAt: Date.now(),
};

export const MOCK_VIDEO = {
  id: 'test-video-1',
  projectId: 'test-project-1',
  videoPath: '/tmp/reframe-test/sample.mp4',
  videoDuration: 30,
  videoWidth: 1920,
  videoHeight: 1080,
  videoFps: 30,
  outputRatio: '9:16' as const,
  outputWidth: 608,
  outputHeight: 1080,
  trim: { start: 0, end: 30 },
  keyframes: [
    {
      id: 'kf-seed-1',
      timestamp: 0,
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      easing: 'linear' as const,
    },
  ],
  slices: [] as any[],
  addedAt: Date.now(),
};

export async function launchElectronApp(
  seed?: AppSeedData,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HEADLESS_E2E: process.env.HEADLESS_E2E || '0',
    },
  });

  // If seed data provided, override the IPC handler *before* the renderer calls it
  if (seed) {
    await app.evaluate(async ({ ipcMain }, seedData) => {
      // Remove existing handler and replace with our mock
      ipcMain.removeHandler('load-app-data');
      ipcMain.handle('load-app-data', async () => seedData);

      // No-op save so tests don't write to disk
      ipcMain.removeHandler('save-app-data');
      ipcMain.handle('save-app-data', async () => {});

      // No-op directory operations
      ipcMain.removeHandler('ensure-directory');
      ipcMain.handle('ensure-directory', async () => {});

      ipcMain.removeHandler('remove-directory');
      ipcMain.handle('remove-directory', async () => {});

      // Mock export to instantly succeed
      ipcMain.removeHandler('export-video');
      ipcMain.handle('export-video', async () => '/tmp/reframe-test/export.mp4');
    }, seed);
  }

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}

/**
 * Launch directly into the editor with a seeded project and video.
 * Sets localStorage route so the app navigates straight to the editor screen.
 */
export async function launchIntoEditor(): Promise<{ app: ElectronApplication; page: Page }> {
  const seed: AppSeedData = {
    basePath: '/tmp/reframe-test',
    projects: [MOCK_PROJECT],
    videos: [MOCK_VIDEO],
  };

  const { app, page } = await launchElectronApp(seed);

  // Clear all localStorage to avoid stale playhead positions from previous tests
  await page.evaluate(() => localStorage.clear());

  // Set the stored route so the app loads into the editor view
  await page.evaluate((ids) => {
    localStorage.setItem(
      'reframe.route',
      JSON.stringify({ view: 'editor', projectId: ids.projectId, videoId: ids.videoId }),
    );
  }, { projectId: MOCK_PROJECT.id, videoId: MOCK_VIDEO.id });

  // Reload so the app reads the seeded route + data
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Wait for the timeline to appear — that means the editor is fully mounted
  await page.waitForSelector('[data-testid="timeline"]', { timeout: 10000 });

  return { app, page };
}

export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

/**
 * Read Zustand editorStore state from the renderer.
 * Requires the store bridge exposed in main.tsx (NODE_ENV=test).
 */
export async function getEditorState(page: Page): Promise<any> {
  return page.evaluate(() => {
    const store = (window as any).__editorStore;
    if (!store) return null;
    const state = store.getState();
    // Return a serializable subset
    return {
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      selectedKeyframeIds: state.selectedKeyframeIds,
      selectedSliceId: state.selectedSliceId,
      keyframes: state.project?.keyframes ?? [],
      slices: state.project?.slices ?? [],
      trim: state.project?.trim ?? { start: 0, end: 0 },
      outputRatio: state.project?.outputRatio ?? null,
      outputWidth: state.project?.outputWidth ?? 0,
      outputHeight: state.project?.outputHeight ?? 0,
      stabilization: state.project?.stabilization ?? null,
      tracking: {
        active: state.tracking.active,
        drawingBox: state.tracking.drawingBox,
        progress: state.tracking.progress,
        resultsCount: state.tracking.results.length,
        untrackedRangesCount: state.tracking.untrackedRanges.length,
        sliceId: state.tracking.sliceId,
      },
      pastLength: state.past.length,
      futureLength: state.future.length,
      hasProject: !!state.project,
    };
  });
}

/**
 * Read Zustand appStore state from the renderer.
 */
export async function getAppState(page: Page): Promise<any> {
  return page.evaluate(() => {
    const store = (window as any).__appStore;
    if (!store) return null;
    const state = store.getState();
    return {
      loaded: state.loaded,
      basePath: state.basePath,
      projects: state.projects,
      videos: state.videos.map((v: any) => ({
        id: v.id,
        projectId: v.projectId,
        keyframes: v.keyframes?.length ?? 0,
        slices: v.slices?.length ?? 0,
      })),
      route: state.route,
    };
  });
}
