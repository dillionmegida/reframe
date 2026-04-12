# Playwright E2E Testing - Setup Complete ✓

Playwright end-to-end testing has been successfully added to Reframe. This gives you high-confidence verification that the app actually works from a user's perspective.

## What Was Added

### 1. Dependencies
- `@playwright/test` - Playwright test runner with Electron support

### 2. Configuration
- `playwright.config.ts` - Playwright configuration for Electron testing
  - Configured for single-worker execution (Electron apps can't run in parallel)
  - Trace/screenshot/video capture on failure
  - Test directory: `tests/e2e/`

### 3. Test Infrastructure
- `tests/e2e/helpers.ts` - Utilities for launching/closing the Electron app
- `tests/e2e/smoke.spec.ts` - Basic smoke tests (app boots, window appears)
- `tests/e2e/project-workflow.spec.ts` - Project creation flow tests
- `tests/e2e/README.md` - Comprehensive testing documentation

### 4. Test Data Attributes
Added `data-testid` attributes to key UI components for stable selectors:

**BasePathSetup:**
- `base-path-display` - Path display field
- `browse-button` - Browse directory button  
- `confirm-base-path-button` - Confirm button

**Sidebar:**
- `new-project-button` - New project button
- `new-project-input` - Project name input
- `project-item-{id}` - Project list items

**Timeline:**
- `timeline` - Timeline container
- `[data-keyframe-dot]` - Keyframe markers (already existed)
- `[data-keyframe-id]` - Specific keyframes (already existed)

### 5. NPM Scripts
```json
"test:e2e": "npm run build && playwright test"
"test:e2e:ui": "npm run build && playwright test --ui"
"test:e2e:debug": "npm run build && playwright test --debug"
```

## Quick Start

### Run all e2e tests
```bash
npm run test:e2e
```

### Run with interactive UI (recommended for development)
```bash
npm run test:e2e:ui
```

### Run in debug mode (step through tests)
```bash
npm run test:e2e:debug
```

## What It Captures

### ✅ Works Great For:
- **App boot** - Window opens, loads correctly
- **Navigation** - Routing between screens works
- **UI interactions** - Buttons, inputs, clicks respond correctly
- **Project management** - Create/select/delete projects
- **Timeline interactions** - Keyframe selection, timeline scrubbing
- **State persistence** - Data saves and loads correctly
- **Keyboard shortcuts** - Hotkeys trigger correct actions
- **Error states** - Error messages appear when expected

### ⚠️ Limitations:
- **Native dialogs** - File/folder pickers can't be automated directly
  - Solution: Add test mode that bypasses dialogs with fixture data
- **FFmpeg exports** - Real video exports are slow (30s+)
  - Solution: Mock exports or use tiny sample clips for smoke tests
- **Performance** - Can't measure frame rates, only functional correctness
  - Solution: Use separate performance profiling tools

## Next Steps

### 1. Add More Test Coverage
Expand tests to cover:
- Video import flow (with test fixtures)
- Keyframe creation/deletion (K key, timeline clicks)
- Pan/zoom adjustments in editor
- Export button states (enabled/disabled based on keyframes)
- Undo/redo functionality

### 2. Handle Native Dialogs in Tests
Add test mode to bypass file dialogs:

```typescript
// In electron/main.ts
ipcMain.handle('open-file', async () => {
  if (process.env.NODE_ENV === 'test') {
    // Return bundled test video instead of showing dialog
    return path.join(__dirname, '../test-fixtures/sample.mp4');
  }
  // ... existing dialog code
});
```

### 3. Mock FFmpeg for Fast Tests
For export tests, stub the FFmpeg layer:

```typescript
// In test setup
test.beforeEach(async ({ app }) => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('export-video');
    ipcMain.handle('export-video', async () => {
      // Return mock success immediately
      return '/fake/export/path.mp4';
    });
  });
});
```

### 4. CI Integration
Add to GitHub Actions:

```yaml
- name: Run E2E Tests
  run: npm run test:e2e
  
- name: Upload test artifacts
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Example: Writing a New Test

```typescript
import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers';

test('should add keyframe with K key', async () => {
  const { app, page } = await launchElectronApp();
  
  // Navigate to editor (assumes base path is set)
  await page.click('[data-testid="new-project-button"]');
  await page.fill('[data-testid="new-project-input"]', 'Test');
  await page.press('[data-testid="new-project-input"]', 'Enter');
  
  // Wait for timeline to load
  await page.waitForSelector('[data-testid="timeline"]');
  
  // Press K to add keyframe
  await page.keyboard.press('k');
  
  // Verify keyframe appears
  await expect(page.locator('[data-keyframe-dot]')).toHaveCount(1);
  
  await closeElectronApp(app);
});
```

## Verification

Tests are currently passing:
```
✓ should launch app and show base path setup on first run
✓ should boot to main window
```

Run `npm run test:e2e` to verify the setup works on your machine.

## Resources

- [Playwright Docs](https://playwright.dev/)
- [Playwright Electron Guide](https://playwright.dev/docs/api/class-electron)
- Test documentation: `tests/e2e/README.md`
