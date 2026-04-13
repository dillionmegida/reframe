import { _electron as electron, ElectronApplication, Page, test } from '@playwright/test';
import path from 'path';

let activeApp: ElectronApplication | null = null;

test.afterEach(async () => {
  if (activeApp) {
    await Promise.race([
      activeApp.close(),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]).catch(() => {});
    activeApp = null;
  }
});

export interface AppSeedData {
  basePath?: string | null;
  projects?: Array<{ id: string; name: string; createdAt: number }>;
  videos?: Array<Record<string, any>>;
}

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

async function seedIpcHandlers(app: ElectronApplication, seed: AppSeedData) {
  await app.evaluate(async ({ ipcMain }, seedData) => {
    ipcMain.removeHandler('load-app-data');
    ipcMain.handle('load-app-data', async () => seedData);

    ipcMain.removeHandler('save-app-data');
    ipcMain.handle('save-app-data', async () => {});

    ipcMain.removeHandler('ensure-directory');
    ipcMain.handle('ensure-directory', async () => {});

    ipcMain.removeHandler('remove-directory');
    ipcMain.handle('remove-directory', async () => {});

    ipcMain.removeHandler('export-video');
    ipcMain.handle('export-video', async () => '/tmp/reframe-test/export.mp4');
  }, seed);
}

export async function launchElectronApp(
  seed?: AppSeedData,
): Promise<{ app: ElectronApplication; page: Page }> {
  const isCI = !!process.env.CI;
  const args = [
    path.join(__dirname, '../../out/main/index.js'),
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
  ];

  const app = await electron.launch({
    args,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HEADLESS_E2E: isCI ? '1' : '0',
    },
  });

  activeApp = app;

  if (seed) {
    await seedIpcHandlers(app, seed);
  }

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { app, page };
}

export async function launchIntoEditor(): Promise<{ app: ElectronApplication; page: Page }> {
  const seed: AppSeedData = {
    basePath: '/tmp/reframe-test',
    projects: [MOCK_PROJECT],
    videos: [MOCK_VIDEO],
  };

  const { app, page } = await launchElectronApp(seed);

  await page.evaluate(() => localStorage.clear());

  await page.evaluate((ids) => {
    localStorage.setItem(
      'reframe.route',
      JSON.stringify({ view: 'editor', projectId: ids.projectId, videoId: ids.videoId }),
    );
  }, { projectId: MOCK_PROJECT.id, videoId: MOCK_VIDEO.id });

  // Re-seed before reload — the reload triggers a fresh load-app-data IPC call
  await seedIpcHandlers(app, seed);

  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const timelineTimeout = process.env.CI ? 30000 : 10000;
  await page.waitForSelector('[data-testid="timeline"]', { timeout: timelineTimeout });

  return { app, page };
}

export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

export async function getEditorState(page: Page): Promise<any> {
  return page.evaluate(() => {
    const store = (window as any).__editorStore;
    if (!store) return null;
    const state = store.getState();
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