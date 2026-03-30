# Implementation Overview

This document explains how the source panel (video input), the preview panel (what you see in the UI), and the export pipeline (final rendered video) work. It focuses on the flow of data, interpolation logic, crop/scale math, and the recent capture-based export approach for smooth zoom/pan.

## Source Panel (Video Input)

- The source video is loaded in the renderer and referenced by an HTMLVideoElement with id `source-video` (see `PreviewPanel.tsx`).
- Metadata (width, height, fps, duration) is obtained via ffprobe (`ipcMain.handle('get-video-metadata')` in `electron/main.ts`).
- Video dimensions are stored in `project.videoWidth` and `project.videoHeight`; output target dimensions are `project.outputWidth` / `project.outputHeight`.
- Keyframes define camera motion: each keyframe has `timestamp`, `x`, `y`, `scale`, and `easing`. The canonical interpolation is `interpolateAtTime` (`src/utils/interpolate.ts`).

## Preview Panel (UI Rendering)

File: `src/components/PreviewPanel.tsx`

- Runs a rAF loop; on each tick:
  1) Reads current time (`state.currentTime`) and project data from the editor store.
  2) Ensures canvas size matches the display container (maintaining output aspect ratio inside available UI space).
  3) Looks up the source video element `#source-video` (must be ready/loaded).
  4) Interpolates keyframes at the current time using `interpolateAtTime` (Hermite/Catmull-Rom) to get `x, y, scale`.
  5) Computes the crop rectangle using the same math as export (see below):
     - Compare source aspect vs output aspect to decide whether height- or width-constrained.
     - cropFracW/cropFracH = 1/scale (adjusted for aspect ratio), clamped to [0.0001, 1].
     - cropW = cropFracW * videoWidth, cropH = cropFracH * videoHeight.
     - cropX = (videoWidth - cropW) * x, cropY = (videoHeight - cropH) * y.
  6) Draws the source video onto the canvas: `ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, canvasW, canvasH)`.
- A small HUD shows the current scale.
- The preview is the ground truth for how zoom/pan should look; export aims to match this exactly.

## Export Pipeline (Current Capture-Based Flow)

Files: `electron/export.ts`, `src/utils/capturePreview.ts`, `electron/preload.ts`, `electron/main.ts`.

### High-level steps

1) `exportVideo` (main process): orchestrates export for one or multiple slices.
2) `exportSingleSlice`: for each slice, uses capture-based slow export to ensure smooth zoom/pan.
3) `exportSegmentSlow`: requests the renderer to capture the preview between `slice.start` and `slice.end` at a fixed fps (30 by default), then muxes source audio for that time range.
4) Renderer capture (`capturePreview.ts`): plays the source video in real-time, draws per rAF with the same crop math, records the canvas via `MediaRecorder (canvas.captureStream)`, and returns a temp webm.
5) Mux: ffmpeg in main transcodes the VP9 webm to h264 mp4 and muxes source audio with `-ss/-t -map 0:v -map 1:a? -c:v libx264 -c:a aac -shortest`.

### IPC flow

- Main -> Renderer: `capture:request` with payload `{ videoPath, start, end, fps, outputWidth, outputHeight, keyframes, videoWidth, videoHeight, replyChannel, progressChannel }`.
- Renderer -> Main:
  - Progress updates on `progressChannel` with `{ progress: pct }`.
  - Completion on `replyChannel` with `{ path }` or `{ error }`.
- Preload (`electron/preload.ts`) exposes `onCaptureRequest`, `respondCapture`, and `respondCaptureProgress`, and `saveTempBlob` for writing the recorded blob to a temp file (main writes to disk; renderer cannot).

### Renderer capture details (`src/utils/capturePreview.ts`)

- Loads the video element from `file://<videoPath>`, waits for metadata.
- Sets up an offscreen canvas sized to output dimensions.
- Starts a MediaRecorder on `canvas.captureStream(fps)`; uses VP9 webm for recording.
- Seeks to `start`, plays the video. Each rAF:
  - Reads `video.currentTime` as `t`; if `t >= end`, stops recording.
  - Computes interpolation at `t` with `interpolateAtTime(keyframes, t)`.
  - Computes crop via `computeCrop` (same as preview).
  - Draws the cropped region onto the canvas.
  - Emits progress = (t - start) / (end - start) * 100 via `progressChannel`.
- On stop, collects chunks, saves to temp webm via `electron.saveTempBlob`, and responds with the file path.

### Main mux details (`electron/export.ts`)

- After capture returns the webm path, ffmpeg muxes:
  - Input 0: captured webm (video)
  - Input 1: source video (for audio)
  - Options: `-ss start -t duration -map 0:v -map 1:a? -c:v libx264 -preset veryfast -crf 18 -c:a aac -shortest`
- Progress: capture progress is mapped to ~90–95%; mux completion sends near-final progress; caller sets 100%.
- Temp directories cleaned after each slice.

### Notes and trade-offs

- Pros: Perfect visual match to preview; smooth per-frame zoom/pan; avoids filter reinit issues.
- Cons: Capture is real-time (duration-bound) and transcodes VP9->h264; dependent on renderer performance. If you need faster-than-real-time, consider enabling GPU-accelerated encoding or keeping capture at lower fps.

## Crop/Scale Math Summary (shared by preview and export)

Given source (vidW, vidH), output (outW, outH), and interp {x,y,scale}:

1) outAspect = outW/outH, vidAspect = vidW/vidH.
2) If outAspect < vidAspect: cropFracH = 1/scale; cropFracW = (outAspect/vidAspect)*cropFracH.
   Else: cropFracW = 1/scale; cropFracH = (vidAspect/outAspect)*cropFracW.
3) Clamp cropFracW/H to [0.0001, 1].
4) cropW = cropFracW * vidW; cropH = cropFracH * vidH.
5) cropX = (vidW - cropW) * x; cropY = (vidH - cropH) * y.
6) drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH).

## Where to look in code

- Preview: `src/components/PreviewPanel.tsx`
- Interpolation: `src/utils/interpolate.ts`
- Capture: `src/utils/capturePreview.ts`
- Export orchestration: `electron/export.ts`
- Mux/audio: `electron/export.ts` (ffmpeg call)
- IPC bridges: `electron/preload.ts`, `electron/main.ts`

## Future improvements

- Use GPU encoding for capture (MediaRecorder mimeType h264 if supported) to reduce transcode cost.
- Allow higher fps captures (60 fps) if performance permits.
- Fallback: if capture fails, auto-retry with lower fps.
- Optional: persistent progress UI per slice (e.g., show capture % and mux % separately).
