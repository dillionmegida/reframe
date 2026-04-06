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
// Export Job Tracking for Cancellation
// ---------------------------------------------------------------------------

interface ExportJob {
  id: string
  sliceId: string
  abortController: AbortController
  ffmpegCommand: ffmpeg.FfmpegCommand | null
  tempDirs: string[]
  state: 'capturing' | 'muxing' | 'done' | 'cancelled' | 'error'
}

const activeJobs = new Map<string, ExportJob>()

export function cancelExport(jobId: string): boolean {
  const job = activeJobs.get(jobId)
  if (!job) return false

  job.state = 'cancelled'
  job.abortController.abort()

  // Kill ffmpeg if running
  if (job.ffmpegCommand) {
    try {
      job.ffmpegCommand.kill('SIGKILL')
    } catch {
      // ignore kill errors
    }
  }

  // Cleanup temp files
  for (const dir of job.tempDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch {
      // ignore cleanup errors
    }
  }

  activeJobs.delete(jobId)
  return true
}

export function cancelExportBySliceId(sliceId: string): boolean {
  for (const [jobId, job] of activeJobs) {
    if (job.sliceId === sliceId) {
      return cancelExport(jobId)
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Helper to format time for filenames (e.g., 50.5s -> "50s" or 125.3s -> "2m5s")
function formatTimeForFilename(seconds: number): string {
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`
  }
  const mins = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`
}

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

  // Preserve the easing of the segment that contains sliceEnd so the motion
  // curve at the clip boundary matches the original (not forced to linear).
  const nextKfAfterEnd = sorted.find((kf) => kf.timestamp > sliceEnd)
  const endKf: Keyframe = {
    id: '__slice_end__',
    timestamp: sliceEnd,
    x: endInterp.x,
    y: endInterp.y,
    scale: endInterp.scale,
    easing: nextKfAfterEnd?.easing ?? 'linear',
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
  abortSignal: AbortSignal,
  onProgress?: (pct: number) => void
): Promise<{ frameDir: string; frameCount: number }> {
  return new Promise((resolve, reject) => {
    const replyChannel = `capture:reply:${randomUUID()}`
    const progressChannel = `${replyChannel}:progress`

    // Scale timeout by frame count: allow ~200ms per frame + 60s buffer, max 45 min
    const clipDuration = payload.end - payload.start
    const frameCount = Math.round(clipDuration * payload.fps)
    const timeoutMs = Math.min(
      Math.max(120_000, frameCount * 200 + 60_000),
      45 * 60 * 1000
    )

    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      ipcMain.removeAllListeners(progressChannel)
      reject(new Error(`Capture timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeout)
      ipcMain.removeAllListeners(replyChannel)
      ipcMain.removeAllListeners(progressChannel)
    }

    // Handle cancellation
    abortSignal.addEventListener('abort', () => {
      cleanup()
      reject(new Error('Export cancelled'))
    })

    ipcMain.once(replyChannel, (_ev, data) => {
      cleanup()
      if (abortSignal.aborted) return reject(new Error('Export cancelled'))
      if (data?.error) return reject(new Error(data.error))
      if (!data?.frameDir) return reject(new Error('No frame directory returned'))
      resolve({ frameDir: data.frameDir, frameCount: data.frameCount ?? 0 })
    })

    if (onProgress) {
      ipcMain.on(progressChannel, (_ev, data) => {
        if (abortSignal.aborted) return
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

function detectStabilization(
  frameDir: string,
  fps: number,
  transformsFile: string,
  abortSignal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(`${frameDir}/frame_%06d.jpg`)
      .inputOptions(['-framerate', String(fps)])
      .outputOptions([
        '-vf', `vidstabdetect=shakiness=10:accuracy=15:result=${transformsFile}`,
        '-f', 'null',
      ])
      .output('-')

    command
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        if (abortSignal.aborted) {
          reject(new Error('Export cancelled'))
        } else {
          reject(err)
        }
      })
      .run()
  })
}

function muxFramesWithAudio(
  frameDir: string,
  sourceVideoPath: string,
  outputPath: string,
  segmentStart: number,
  duration: number,
  fps: number,
  abortSignal: AbortSignal,
  stabilization?: { enabled: boolean; smoothing?: number; transformsFile?: string }
): { command: ffmpeg.FfmpegCommand; promise: Promise<void> } {
  const smoothing = stabilization?.smoothing ?? 10
  const useStabilization = stabilization?.enabled && stabilization?.transformsFile
  
  const videoFilter = useStabilization
    ? `vidstabtransform=input=${stabilization.transformsFile}:smoothing=${smoothing}:zoom=1:optzoom=0`
    : undefined

  const command = ffmpeg()
    .input(`${frameDir}/frame_%06d.jpg`)
    .inputOptions(['-framerate', String(fps)])
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
      '-pix_fmt', 'yuv420p',
      ...(videoFilter ? ['-vf', videoFilter] : []),
      '-r', String(fps),
      '-c:a', 'aac',
      '-b:a', '256k',
      '-movflags', '+faststart',
      '-shortest',
    ])
    .output(outputPath)

  const promise = new Promise<void>((resolve, reject) => {
    command
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        if (abortSignal.aborted) {
          reject(new Error('Export cancelled'))
        } else {
          reject(err)
        }
      })
      .run()
  })

  return { command, promise }
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
  jobId: string
  abortController: AbortController
  tempDir: string
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
    const { slice, outputPath, activeKeyframes, jobId, abortController, tempDir } = job
    const duration = slice.end - slice.start
    const abortSignal = abortController.signal

    // Register job for cancellation tracking
    const exportJob: ExportJob = {
      id: jobId,
      sliceId: slice.id,
      abortController,
      ffmpegCommand: null,
      tempDirs: [tempDir],
      state: 'capturing',
    }
    activeJobs.set(jobId, exportJob)

    // Check if already cancelled
    if (abortSignal.aborted) {
      sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 0, state: 'error', error: 'Export cancelled' })
      continue
    }

    sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 0, state: 'progress' })

    try {
      // --- Capture (sequential — renderer can only do one at a time) ---
      const { frameDir, frameCount: _frameCount } = await requestPreviewCapture(
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
        abortSignal,
        (pct) => {
          if (abortSignal.aborted) return
          // Capture = 0–80% of reported progress; mux = 80–100%
          sendSliceProgress(mainWindow, { sliceId: slice.id, progress: pct * 0.8 })
        }
      )

      // Register frameDir for cancellation cleanup
      exportJob.tempDirs.push(frameDir)

      if (abortSignal.aborted) {
        throw new Error('Export cancelled')
      }

      sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 80 })
      exportJob.state = 'muxing'

      // --- Stabilization detection (if enabled) ---
      let transformsFile: string | undefined
      if (project.stabilization?.enabled) {
        transformsFile = path.join(tempDir, 'transforms.trf')
        try {
          await detectStabilization(frameDir, fps, transformsFile, abortSignal)
          exportJob.tempDirs.push(transformsFile)
        } catch (err: any) {
          if (!abortSignal.aborted) {
            console.warn('[export] Stabilization detection failed, continuing without:', err.message)
          }
          transformsFile = undefined
        }
      }

      // --- Mux (fire-and-forget into the pool; does NOT block the next capture) ---
      const { command, promise } = muxFramesWithAudio(
        frameDir,
        project.videoPath,
        outputPath,
        slice.start,
        duration,
        fps,
        abortSignal,
        project.stabilization?.enabled
          ? {
              enabled: true,
              smoothing: project.stabilization.smoothing,
              transformsFile,
            }
          : undefined
      )

      exportJob.ffmpegCommand = command

      const muxPromise = promise
        .then(() => {
          // Cleanup frame dir after successful mux
          try {
            if (fs.existsSync(frameDir)) fs.rmSync(frameDir, { recursive: true, force: true })
          } catch { /* ignore */ }
          if (abortSignal.aborted) return
          exportJob.state = 'done'
          activeJobs.delete(jobId)
          sendSliceProgress(mainWindow, {
            sliceId: slice.id,
            progress: 100,
            state: 'done',
            path: outputPath,
          })
        })
        .catch((err: Error) => {
          // Cleanup frame dir on error
          try {
            if (fs.existsSync(frameDir)) fs.rmSync(frameDir, { recursive: true, force: true })
          } catch { /* ignore */ }
          if (abortSignal.aborted) {
            exportJob.state = 'cancelled'
            activeJobs.delete(jobId)
            sendSliceProgress(mainWindow, {
              sliceId: slice.id,
              progress: 80,
              state: 'error',
              error: 'Export cancelled',
            })
            return
          }
          exportJob.state = 'error'
          activeJobs.delete(jobId)
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
    } catch (err: any) {
      if (abortSignal.aborted) {
        exportJob.state = 'cancelled'
        activeJobs.delete(jobId)
        sendSliceProgress(mainWindow, {
          sliceId: slice.id,
          progress: 0,
          state: 'error',
          error: 'Export cancelled',
        })
        // Clean up temp dir on cancellation
        try {
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true })
          }
        } catch {
          // ignore cleanup errors
        }
        continue
      }
      exportJob.state = 'error'
      activeJobs.delete(jobId)
      sendSliceProgress(mainWindow, {
        sliceId: slice.id,
        progress: 0,
        state: 'error',
        error: err.message,
      })
      throw err
    }
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
    jobId?: string
  },
  outputDir: string,
  mainWindow: BrowserWindow
): Promise<string[]> {
  const { project, slices, jobId: exportJobId } = args
  const exportSlices = slices && slices.length > 0 ? slices : undefined

  const results: { sliceId: string; path: string }[] = []
  const fps = project.videoFps || 30

  // Resolution label for filename e.g. "1214x2160"
  const resLabel = `${project.outputWidth}x${project.outputHeight}`

  // Create a job for each slice with its own abort controller
  const createJob = (slice: Slice, index: number, tempDir: string): SliceJob => {
    const baseName = outputDir.replace(/\.[^.]+$/, '')
    const ext = outputDir.match(/(\.[ ^.]+)$/)?.[1] ?? '.mp4'
    const total = exportSlices?.length || 1
    
    // Generate timestamp-based filename
    const startTime = formatTimeForFilename(slice.start)
    const endTime = formatTimeForFilename(slice.end)
    const timestampLabel = `${startTime}-to-${endTime}`
    
    const outputPath =
      total === 1
        ? `${baseName}_${timestampLabel}_${resLabel}${ext}`
        : `${baseName}_${timestampLabel}_${resLabel}${ext}`

    return {
      slice,
      outputPath,
      activeKeyframes: buildSliceKeyframes(project.keyframes, slice.start, slice.end),
      jobId: exportJobId ? `${exportJobId}-${slice.id}` : `export-${slice.id}-${Date.now()}`,
      abortController: new AbortController(),
      tempDir,
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
      const tempDir = path.join(os.tmpdir(), `reframe-export-${randomUUID()}`)
      fs.mkdirSync(tempDir, { recursive: true })

      const job = createJob(slice, 0, tempDir)

      const jobs: SliceJob[] = [job]

      await runPipeline(jobs, project, mainWindow, fps)

      results.push({ sliceId: slice.id, path: job.outputPath })
      mainWindow.webContents.send('export:done', { paths: [job.outputPath], results })
      return [job.outputPath]
    }

    // Multi-slice: build all jobs first, then run the pipeline
    const jobs: SliceJob[] = exportSlices.map((slice, i) => {
      const tempDir = path.join(os.tmpdir(), `reframe-export-${randomUUID()}`)
      fs.mkdirSync(tempDir, { recursive: true })
      return createJob(slice, i, tempDir)
    })

    await runPipeline(jobs, project, mainWindow, fps)

    jobs.forEach((job) => {
      results.push({ sliceId: job.slice.id, path: job.outputPath })
    })

    const outputPaths = jobs.map((j) => j.outputPath)
    mainWindow.webContents.send('export:done', { paths: outputPaths, results })
    return outputPaths
  } catch (err) {
    // Cleanup is handled per-job in runPipeline
    throw err
  }
}