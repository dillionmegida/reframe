import { BrowserWindow, ipcMain } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import { interpolateAtTime } from '../src/utils/interpolate'
import type { Project, Slice, Keyframe } from '../src/types'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSliceKeyframes(
  allKeyframes: Keyframe[],
  sliceStart: number,
  sliceEnd: number
): Keyframe[] {
  const sorted = [...allKeyframes].sort((a, b) => a.timestamp - b.timestamp)

  const startInterp = interpolateAtTime(sorted, sliceStart)
  const endInterp = interpolateAtTime(sorted, sliceEnd)

  const startKf: Keyframe = {
    id: '__slice_start__',
    timestamp: sliceStart,
    x: startInterp.x,
    y: startInterp.y,
    scale: startInterp.scale,
    easing: 'linear',
  }

  const endKf: Keyframe = {
    id: '__slice_end__',
    timestamp: sliceEnd,
    x: endInterp.x,
    y: endInterp.y,
    scale: endInterp.scale,
    easing: 'linear',
  }

  const interior = sorted.filter(
    (kf) => kf.timestamp > sliceStart && kf.timestamp < sliceEnd
  )

  const result = [startKf, ...interior, endKf]
  const seen = new Set<number>()
  return result.filter((kf) => {
    const key = Math.round(kf.timestamp * 10000)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sendSliceProgress(
  mainWindow: BrowserWindow,
  payload: {
    sliceId: string
    progress: number
    state?: 'progress' | 'done' | 'error'
    path?: string
    error?: string
  }
) {
  const clamped = Math.max(0, Math.min(100, payload.progress))
  mainWindow.webContents.send('export:progress', { ...payload, progress: clamped })
}

// ---------------------------------------------------------------------------
// Phase 1: capture (renderer, sequential)
// ---------------------------------------------------------------------------

function requestPreviewCapture(
  mainWindow: BrowserWindow,
  payload: {
    videoPath: string
    start: number
    end: number
    fps: number
    outputWidth: number
    outputHeight: number
    keyframes: Keyframe[]
    videoWidth: number
    videoHeight: number
  },
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const replyChannel = `capture:reply:${randomUUID()}`
    const progressChannel = `${replyChannel}:progress`

    // Scale timeout to clip duration: min 60s, max 20 minutes
    const clipDuration = payload.end - payload.start
    const timeoutMs = Math.min(
      Math.max(60_000, (clipDuration + 30) * 1000),
      20 * 60 * 1000
    )

    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      ipcMain.removeAllListeners(progressChannel)
      reject(new Error(`Capture timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    ipcMain.once(replyChannel, (_ev, data) => {
      clearTimeout(timeout)
      ipcMain.removeAllListeners(progressChannel)
      if (data?.error) return reject(new Error(data.error))
      if (!data?.path) return reject(new Error('No capture path returned'))
      resolve(data.path)
    })

    if (onProgress) {
      ipcMain.on(progressChannel, (_ev, data) => {
        const pct = typeof data?.progress === 'number' ? data.progress : 0
        onProgress(Math.max(0, Math.min(100, pct)))
      })
    }

    mainWindow.webContents.send('capture:request', {
      ...payload,
      replyChannel,
      progressChannel,
    })
  })
}

// ---------------------------------------------------------------------------
// Phase 2: mux (main process, ffmpeg — runs concurrently with other muxes)
// ---------------------------------------------------------------------------

function muxCaptureWithAudio(
  capturePath: string,
  sourceVideoPath: string,
  outputPath: string,
  segmentStart: number,
  duration: number,
  fps: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(capturePath)
      .input(sourceVideoPath)
      .inputOptions([
        '-ss', String(segmentStart),
        '-t', String(duration),
      ])
      .outputOptions([
        '-map', '0:v',
        '-map', '1:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '15',
        '-r', String(fps),
        '-vsync', 'cfr',
        '-c:a', 'aac',
        '-b:a', '256k',
        '-movflags', '+faststart',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', (err: Error) => reject(err))
      .run()
  })
}

// ---------------------------------------------------------------------------
// Pipeline
//
// The idea: captures are sequential (one at a time in the renderer) but each
// mux starts immediately after its capture finishes, without waiting for the
// next capture to complete. So while slice N+1 is being captured, slice N's
// mux is already running in parallel in the main process.
//
// Timeline for 3 slices:
//
//   [capture 1]
//              [capture 2] [mux 1 ...]
//                          [capture 3] [mux 2 ...]
//                                                  [mux 3 ...]
//
// vs fully sequential:
//   [capture 1][mux 1][capture 2][mux 2][capture 3][mux 3]
//
// The total time saved is (N-1) * avg_mux_duration.
// ---------------------------------------------------------------------------

interface SliceJob {
  slice: Slice
  outputPath: string
  activeKeyframes: Keyframe[]
}

async function runPipeline(
  jobs: SliceJob[],
  project: Project,
  mainWindow: BrowserWindow,
  fps: number
): Promise<void> {
  // Tracks in-flight mux promises so we can await them all at the end
  const muxPromises: Promise<void>[] = []

  for (const job of jobs) {
    const { slice, outputPath, activeKeyframes } = job
    const duration = slice.end - slice.start

    sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 0, state: 'progress' })

    // --- Capture (sequential — renderer can only do one at a time) ---
    const capturePath = await requestPreviewCapture(
      mainWindow,
      {
        videoPath: project.videoPath,
        start: slice.start,
        end: slice.end,
        fps,
        outputWidth: project.outputWidth,
        outputHeight: project.outputHeight,
        keyframes: activeKeyframes,
        videoWidth: project.videoWidth,
        videoHeight: project.videoHeight,
      },
      (pct) => {
        // Capture = 0–80% of reported progress; mux = 80–100%
        sendSliceProgress(mainWindow, { sliceId: slice.id, progress: pct * 0.8 })
      }
    )

    sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 80 })

    // --- Mux (fire-and-forget into the pool; does NOT block the next capture) ---
    const muxPromise = muxCaptureWithAudio(
      capturePath,
      project.videoPath,
      outputPath,
      slice.start,
      duration,
      fps
    )
      .then(() => {
        sendSliceProgress(mainWindow, {
          sliceId: slice.id,
          progress: 100,
          state: 'done',
          path: outputPath,
        })
      })
      .catch((err: Error) => {
        sendSliceProgress(mainWindow, {
          sliceId: slice.id,
          progress: 80,
          state: 'error',
          error: err.message,
        })
        // Re-throw so the outer Promise.all surfaces the error
        throw err
      })

    muxPromises.push(muxPromise)

    // Next iteration immediately starts the next capture while this mux runs
  }

  // Wait for all muxes to finish before returning
  await Promise.all(muxPromises)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function exportVideo(
  args: {
    project: Project
    slices?: Slice[]
    basePath?: string
    projectName?: string
    videoId?: string
  },
  outputDir: string,
  mainWindow: BrowserWindow
): Promise<string[]> {
  const { project, slices } = args
  const exportSlices = slices && slices.length > 0 ? slices : undefined

  const results: { sliceId: string; path: string }[] = []
  const fps = 30

  // Resolution label for filename e.g. "1214x2160"
  const resLabel = `${project.outputWidth}x${project.outputHeight}`

  const tempDirs: string[] = []

  const makeTempDir = () => {
    const dir = path.join(os.tmpdir(), `reframe-export-${randomUUID()}`)
    fs.mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  const cleanup = () => {
    for (const dir of tempDirs) {
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // non-fatal
      }
    }
  }

  try {
    // No slices: treat full trim range as a single slice
    if (!exportSlices) {
      const slice: Slice = {
        id: 'full-trim',
        start: project.trim.start,
        end: project.trim.end,
        status: 'keep',
      }
      const outputPath = outputDir.replace(/(\.[^.]+)$/, `_${resLabel}$1`)
      makeTempDir()

      const jobs: SliceJob[] = [{
        slice,
        outputPath,
        activeKeyframes: buildSliceKeyframes(project.keyframes, slice.start, slice.end),
      }]

      await runPipeline(jobs, project, mainWindow, fps)

      results.push({ sliceId: slice.id, path: outputPath })
      mainWindow.webContents.send('export:done', { paths: [outputPath], results })
      return [outputPath]
    }

    // Multi-slice: build all jobs first, then run the pipeline
    const total = exportSlices.length
    const outputPaths: string[] = []

    const jobs: SliceJob[] = exportSlices.map((slice, i) => {
      const baseName = outputDir.replace(/\.[^.]+$/, '')
      const ext = outputDir.match(/(\.[^.]+)$/)?.[1] ?? '.mp4'
      const outputPath =
        total === 1
          ? outputDir.replace(/(\.[^.]+)$/, `_${resLabel}$1`)
          : `${baseName}_slice-${i + 1}_${resLabel}${ext}`

      makeTempDir()
      outputPaths[i] = outputPath

      return {
        slice,
        outputPath,
        activeKeyframes: buildSliceKeyframes(project.keyframes, slice.start, slice.end),
      }
    })

    await runPipeline(jobs, project, mainWindow, fps)

    outputPaths.forEach((p, i) => {
      results.push({ sliceId: exportSlices[i].id, path: p })
    })

    mainWindow.webContents.send('export:done', { paths: outputPaths, results })
    return outputPaths
  } finally {
    cleanup()
  }
}