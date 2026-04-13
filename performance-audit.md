# Reframe Performance Audit

Comprehensive analysis of performance issues, blocking operations, and optimization opportunities.

---

## ~~🟠 High: Main Thread Blocking in Renderer~~ ✅ Resolved

### 10. ~~`simpleTracker.ts` — NCC tracking runs on the **main thread**~~ ✅

**Resolution:** Created `src/utils/trackerWorker.ts` — a dedicated Web Worker that contains the full NCC tracking logic (toGrey, getPatch, ncc, search loop, sub-pixel refinement, template blending). The tracker bridge now streams frames to this worker one at a time via `postMessage` with transferable `ArrayBuffer`s (zero-copy). All CPU-heavy NCC computation runs off the main thread.

---

### 11. ~~`trackerBridge.ts:19-88` — `extractFrames` blocks renderer with sequential seeks~~ ✅

**Resolution:** Replaced the two-phase "extract all frames then track" approach with a streaming pipeline. Frames are now extracted one at a time, and each frame's `ArrayBuffer` is immediately transferred to the tracker worker and released — only one frame's pixel data is in memory at a time. This reduces peak memory from ~234 MB to ~500 KB for tracking.

---

### 12. ~~`capturePreview.ts:57-101` — Export capture loop blocks renderer~~ ✅

**Resolution:** Created `src/utils/captureWorker.ts` — a Web Worker using `OffscreenCanvas` for the expensive draw + JPEG encode. The main thread still handles video seeking (DOM-bound) but creates lightweight `ImageBitmap` objects via `createImageBitmap(video)` and transfers them to the worker (zero-copy). The worker draws the cropped region and calls `canvas.convertToBlob()` entirely off the main thread.

---

## 🟡 Medium: Unnecessary Recalculations & Re-renders

### 13. `interpolateAtTime` called redundantly — crop computed in 3 separate places

**Locations:**
- `@/Users/dillion/Desktop/github/reframe/src/components/SourcePanel.tsx:271-284` (inline math)
- `@/Users/dillion/Desktop/github/reframe/src/components/PreviewPanel.tsx:156-171` (inline math)
- `@/Users/dillion/Desktop/github/reframe/src/utils/computeCrop.ts:1-30` (utility function)
- `@/Users/dillion/Desktop/github/reframe/src/utils/webCodecsExport.ts:81-96` (inline math)
- `@/Users/dillion/Desktop/github/reframe/src/utils/capturePreview.ts:75-78` (uses `computeCrop`)

**Issue:** SourcePanel and PreviewPanel duplicate the crop math inline instead of using `computeCrop()`. This means 3 copies to maintain and potential drift. `PreviewPanel.tsx` doesn't even memoize the crop — it recalculates inside a `requestAnimationFrame` loop on every frame.

**Fix:** Consolidate all crop calculations to use `computeCrop()`.

---

### 14. `PreviewPanel.tsx` — rAF loop runs **forever** even when paused

**Location:** `@/Users/dillion/Desktop/github/reframe/src/components/PreviewPanel.tsx:181-189`

```typescript
    const startRaf = () => {
      const tick = () => {
        if (stopped) return
        const state = useEditorStore.getState()
        drawAtTime(state.currentTime)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
```

**Issue:** The rAF loop has no play/pause awareness. When the video is paused, it still runs `drawAtTime` + `getState()` + `interpolateAtTime` + `ctx.drawImage` on every animation frame (~60fps). The `lastDrawnTimeRef` guard (line 147) helps avoid actual draw calls, but you still run the full state fetch + interpolation just to discover nothing changed.

**Fix:** Pause the loop when `isPlaying` is false and only redraw on `currentTime` state changes.

---

### 15. `interpolateAtTime` — `resolveKeyframeScales` clones the entire array every call

**Location:** `@/Users/dillion/Desktop/github/reframe/src/utils/interpolate.ts:4-22`

```typescript
function resolveKeyframeScales(keyframes: Keyframe[]): Keyframe[] {
  if (keyframes.length === 0) return []
  
  const resolved: Keyframe[] = []
  ...
    resolved.push({ ...kf, scale: kf.scale })
  ...
  return resolved
}
```

**Issue:** Called on every frame during playback (from SourcePanel's `useMemo`, PreviewPanel's rAF loop, and capturePreview). Each call clones every keyframe with spread. For playback at 60fps with, say, 20 keyframes, that's 1200 object allocations/sec.

**Fix:** Memoize or cache the scale resolution when keyframes change rather than on every interpolation call.

---

### 16. `editorStore.ts` — `sortKeyframes` creates a new copy on every mutation

**Location:** `@/Users/dillion/Desktop/github/reframe/src/store/editorStore.ts:99-101`

```typescript
function sortKeyframes(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.timestamp - b.timestamp)
}
```

**Issue:** Called in `addOrUpdateKeyframe`, `updateKeyframe`, `cloneKeyframeMinus`, and `applyTrackingAsKeyframes`. The spread + sort is fine for correctness, but for `updateKeyframe` where only properties like easing change (not timestamp), the sort is unnecessary.

**Fix:** Check if the timestamp actually changed before sorting.

---

### 17. `editorStore.ts` — `pushUndo` clones on every mutation even for trivial changes

**Location:** `@/Users/dillion/Desktop/github/reframe/src/store/editorStore.ts:107-116`

```typescript
function pushUndo(past: UndoSnapshot[], keyframes: Keyframe[], trim: TrimRange, slices: Slice[]): UndoSnapshot[] {
  const snapshot: UndoSnapshot = {
    keyframes: deepCopyKeyframes(keyframes),
    trim: { ...trim },
    slices: deepCopySlices(slices),
  }
  const newPast = [...past, snapshot]
  if (newPast.length > 50) newPast.shift()
  return newPast
}
```

**Issue:** `setSliceStatus` doesn't push undo (good), but `updateSlice` does for simple handle drags, meaning every pixel of a drag generates a full undo snapshot.

**Fix:** Consider debouncing undo pushes during continuous operations.

---

### 18. `EditorScreen.tsx` — `handleKeyDown` re-created on every state change

**Location:** `@/Users/dillion/Desktop/github/reframe/src/screens/EditorScreen.tsx:292-411`

```typescript
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      ...
    },
    [
      project,
      isPlaying,
      currentTime,
      selectedKeyframeIds,
      selectedSliceId,
      ...
    ]
  )
```

**Issue:** The dependency on `currentTime` means this callback is re-created on **every frame during playback**. Since `currentTime` is only used for step calculations, you could read it from `useEditorStore.getState().currentTime` inside the callback instead, removing it from deps.

**Fix:** Remove `currentTime` from dependencies and read it via `getState()` inside the callback.

---

### 19. `Timeline.tsx` — Too many individual `useEditorStore` selector calls

**Location:** `@/Users/dillion/Desktop/github/reframe/src/components/Timeline.tsx:342-364`

```typescript
  const project = useEditorStore((s) => s.project!)
  const currentTime = useEditorStore((s) => s.currentTime)
  const selectedKeyframeIds = useEditorStore((s) => s.selectedKeyframeIds)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe)
  // ... 18 more selectors
```

**Issue:** Each selector creates a separate subscription. When `currentTime` changes during playback (~60 times/sec), Zustand checks all subscriptions. The action selectors (e.g., `setCurrentTime`, `selectKeyframe`) return stable function references and won't trigger re-renders, but the data selectors (`project`, `currentTime`, `selectedKeyframeIds`, `tracking`) all potentially cause re-renders. The `Timeline` component is extremely large and would benefit from being split so that only the parts that actually need `currentTime` re-render.

**Fix:** Split Timeline into smaller components with more targeted subscriptions.

---

### 20. `Toolbar.tsx` — Subscribes to `currentTime` causing re-render every frame

**Location:** `@/Users/dillion/Desktop/github/reframe/src/components/Toolbar.tsx:282`

```typescript
  const currentTime = useEditorStore((s) => s.currentTime)
```

**Issue:** Used only at line 306 to find `currentSlice`. During playback, this causes the entire Toolbar to re-render ~60 times/sec.

**Fix:** Compute `currentSlice` inside event handlers using `getState()` instead of subscribing to `currentTime`.

---

## 🟢 Low: Code Quality / Minor Improvements

### 21. `formatTime` duplicated 4 times

**Locations:**
- `@/Users/dillion/Desktop/github/reframe/src/components/Timeline.tsx:12-16`
- `@/Users/dillion/Desktop/github/reframe/src/components/Playback.tsx:4-8`
- `@/Users/dillion/Desktop/github/reframe/src/components/Toolbar.tsx:10-14`
- `@/Users/dillion/Desktop/github/reframe/src/screens/EditorScreen.tsx:468-486` (two more variants inline!)

**Issue:** Same function defined independently in multiple files.

**Fix:** Extract to shared utility file.

Similarly, `formatTimeForFilename` is duplicated in both `@/Users/dillion/Desktop/github/reframe/electron/main.ts:157-165` and `@/Users/dillion/Desktop/github/reframe/electron/export.ts:73-81`.

---

### 22. `ExportContext.tsx:74-131` — IPC listeners accumulate without cleanup

**Location:** `@/Users/dillion/Desktop/github/reframe/src/contexts/ExportContext.tsx:74-131`

```typescript
    window.electron.onExportProgress((payload: any) => { ... })
    window.electron.onExportDone((payload: any) => { ... })
```

**Issue:** Every call to `startExport` adds **new** `ipcRenderer.on` listeners via `onExportProgress` / `onExportDone` without removing old ones. After multiple exports, you'll have stale listeners accumulating. The preload API doesn't expose a removal mechanism.

**Fix:** Add cleanup mechanism to preload API or use a single persistent listener.

---

### 23. `electron/main.ts:23-31` — `require()` calls inside functions

**Location:** `@/Users/dillion/Desktop/github/reframe/electron/main.ts:23-31`

```typescript
function getFFprobePath(): string {
  const ffprobe = require('ffprobe-static')
  return ffprobe.path
}

function getFfmpegPath(): string {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
  return ffmpegInstaller.path
}
```

**Issue:** `require()` is synchronous and does module resolution each time (even though Node caches).

**Fix:** Move to top-level imports or lazy-cache.

---

### 24. `electron/main.ts:35-36` — Re-importing `os` module locally when it's already imported at top

**Location:** `@/Users/dillion/Desktop/github/reframe/electron/main.ts:35-36`

```typescript
function getDataPath(): string {
  const os = require('os')
```

**Issue:** `os` is already imported at line 7.

**Fix:** Remove local import and use top-level import.

---

### 25. `webCodecsExport.ts` — Appears unused / incomplete

**Location:** `@/Users/dillion/Desktop/github/reframe/src/utils/webCodecsExport.ts:122-124`

```typescript
  // Write output file (this would need electron IPC to write to disk)
  // For now, return the encoded chunks
  console.log('Encoded', chunks.length, 'chunks')
```

**Issue:** This file doesn't actually write output. It also doesn't seem to be imported anywhere.

**Fix:** Remove dead code or complete implementation.

---

### 26. `sync.ts` — Appears unused

**Location:** `@/Users/dillion/Desktop/github/reframe/src/utils/sync.ts`

**Issue:** Exports `setupVideoSync` but no imports found anywhere in the codebase.

**Fix:** Remove dead code.

---

### 27. `export.ts:556-559` — Identical branch in ternary

**Location:** `@/Users/dillion/Desktop/github/reframe/electron/export.ts:556-559`

```typescript
    const outputPath =
      total === 1
        ? `${baseName}_${timestampLabel}_${resLabel}${ext}`
        : `${baseName}_${timestampLabel}_${resLabel}${ext}`
```

**Issue:** Both branches of the ternary are identical.

**Fix:** Remove ternary and use single expression.

---

### 28. `electron/main.ts:174-175` — Dead code

**Location:** `@/Users/dillion/Desktop/github/reframe/electron/main.ts:174-175`

```typescript
    const sliceCount = slices?.length || 0
    const defaultName = sliceCount > 1 ? 'reframe-export.mp4' : 'reframe-export.mp4'
```

**Issue:** `sliceCount` is computed but the ternary is identical on both sides. `sliceCount` is unused.

**Fix:** Remove dead code.

---

## Summary of Priority Actions

| Priority | Issue | Impact |
| -------- | ----- | ------ |
| 🔴 | **#1-9:** Replace all sync FS ops in `electron/main.ts` and `export.ts` with async | Unblocks Electron main process |
| 🔴 | **#10:** Move `simpleTracker.ts` NCC work to a Web Worker | Unblocks renderer during tracking |
| 🟠 | **#14:** Stop PreviewPanel rAF loop when paused | Saves ~60 interpolation calls/sec when idle |
| 🟠 | **#18, #20:** Remove `currentTime` from `handleKeyDown` deps and `Toolbar` selector | Eliminates per-frame re-renders of large components |
| 🟠 | **#15:** Memoize `resolveKeyframeScales` (or cache resolved keyframes in store) | Eliminates ~1200+ object allocs/sec during playback |
| 🟠 | **#22:** Fix IPC listener leak in `ExportContext` | Prevents memory leak across multiple exports |
| 🟡 | **#13:** Consolidate crop math to use `computeCrop()` everywhere | DRY, fewer bugs |
| 🟡 | **#16:** Conditionally skip `sortKeyframes` when timestamp didn't change | Avoids unnecessary array copies |
| 🟡 | **#21:** Extract shared `formatTime` utility | DRY |
| 🟢 | **#25-28:** Remove dead code (`webCodecsExport.ts`, `sync.ts`, identical ternaries) | Cleaner codebase |

---

## Next Steps

1. Start with critical sync FS operations (#1-9)
2. Move tracker to Web Worker (#10)
3. Optimize render loops (#14, #18, #20)
4. Memoize expensive calculations (#15)
5. Fix memory leaks (#22)
6. Clean up code quality issues (#21, #23-28)
