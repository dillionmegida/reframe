# End-to-End Tests with Playwright

This directory contains Playwright end-to-end tests for the Reframe Electron app.

## Overview

These tests verify that the application works correctly from a user's perspective by:
- Launching the actual Electron app
- Simulating user interactions (clicks, keyboard input, etc.)
- Asserting that the UI responds correctly
- Capturing screenshots/videos on failure for debugging

## Running Tests

### Prerequisites

1. Build the app first (tests run against the built version):
   ```bash
   npm run build
   ```

### Run all e2e tests
```bash
npm run test:e2e
```

### Run tests with UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in debug mode
```bash
npm run test:e2e:debug
```

### Run a specific test file
```bash
npm run build && npx playwright test tests/e2e/smoke.spec.ts
```

## Test Structure

- **`helpers.ts`** - Shared utilities for launching/closing the Electron app
- **`smoke.spec.ts`** - Basic smoke tests (app boots, window appears)
- **`project-workflow.spec.ts`** - Project creation and navigation flows

## Writing Tests

### Basic Test Template

```typescript
import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers';

test.describe('Feature Name', () => {
  test('should do something', async () => {
    const { app, page } = await launchElectronApp();

    // Your test code here
    await expect(page.locator('[data-testid="some-element"]')).toBeVisible();

    await closeElectronApp(app);
  });
});
```

### Using Test Data Attributes

Prefer `data-testid` attributes for stable selectors:

```typescript
// Good - stable selector
await page.click('[data-testid="new-project-button"]');

// Avoid - brittle text-based selectors
await page.click('text=New Project');
```

### Available Test IDs

Key UI elements with test IDs:

**Base Path Setup:**
- `base-path-display` - Path display field
- `browse-button` - Browse directory button
- `confirm-base-path-button` - Confirm button

**Sidebar:**
- `new-project-button` - New project button
- `new-project-input` - Project name input field
- `project-item-{id}` - Individual project items

**Timeline:**
- `timeline` - Timeline container
- `[data-keyframe-dot]` - Keyframe dots
- `[data-keyframe-id="{id}"]` - Specific keyframe by ID

## Handling Native Dialogs

Native file/folder dialogs cannot be automated directly. For tests that require file selection:

1. Add a test mode in the main process that bypasses dialogs
2. Use environment variable `NODE_ENV=test` (already set in helpers)
3. Conditionally load a sample video in test mode

Example in `electron/main.ts`:
```typescript
if (process.env.NODE_ENV === 'test') {
  // Return a bundled test video path instead of showing dialog
  return path.join(__dirname, '../test-fixtures/sample.mp4');
}
```

## FFmpeg Export Testing

Full video exports are slow and brittle. Strategies:

1. **Stub exports** - Mock the IPC handler in test mode
2. **Smoke exports** - Use a tiny 1-second sample clip
3. **Nightly builds** - Run full export tests separately in CI

## CI Considerations

- Electron runs fine on macOS/Linux GitHub Actions runners
- Use `xvfb` for headless Linux runs
- Enable trace/screenshot/video artifacts on failure:
  ```typescript
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  }
  ```

## Debugging Failed Tests

1. **Check artifacts** - Playwright saves screenshots/videos in `test-results/`
2. **Use UI mode** - `npm run test:e2e:ui` for step-by-step debugging
3. **Use debug mode** - `npm run test:e2e:debug` to pause execution
4. **Check console logs** - Use `page.on('console', msg => console.log(msg.text()))`

## Best Practices

1. **Build before testing** - Always run `npm run build` first
2. **Use data-testid** - Add test IDs to new UI components
3. **Keep tests focused** - One feature/flow per test
4. **Clean up** - Always call `closeElectronApp(app)` at the end
5. **Wait for elements** - Use `waitFor` to handle async rendering
6. **Avoid hardcoded delays** - Use Playwright's auto-waiting instead of `setTimeout`

## Limitations

- Cannot automate native OS dialogs (file pickers, etc.)
- FFmpeg operations are slow - consider mocking for speed
- Tests run against production build, not dev mode
