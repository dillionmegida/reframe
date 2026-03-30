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

/**
 * Build effective keyframes for a slice by interpolating at its boundaries
 * using the full keyframe set. Ensures the export curve matches the preview
 * at slice edges even when keyframes fall outside the slice range.
 */
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
    kf => kf.timestamp > sliceStart && kf.timestamp < sliceEnd
  )

  const result = [startKf, ...interior, endKf]
  const seen = new Set<number>()
  return result.filter(kf => {
    const key = Math.round(kf.timestamp * 10000)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Compute crop dimensions matching the preview logic exactly
 */
function computeCropForFrame(
  interp: { x: number; y: number; scale: number },
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): { cropW: number; cropH: number; cropX: number; cropY: number } {
  const vidAspect = sourceWidth / sourceHeight
  const outAspect = outputWidth / outputHeight

  let cropFracW: number
  let cropFracH: number
  if (outAspect < vidAspect) {
    cropFracH = 1 / Math.max(interp.scale, 0.0001)
    cropFracW = (outAspect / vidAspect) * cropFracH
  } else {
    cropFracW = 1 / Math.max(interp.scale, 0.0001)
    cropFracH = (vidAspect / outAspect) * cropFracW
  }

  cropFracW = Math.min(1, Math.max(0.0001, cropFracW))
  cropFracH = Math.min(1, Math.max(0.0001, cropFracH))

  const cropW = Math.floor((cropFracW * sourceWidth) / 2) * 2
  const cropH = Math.floor((cropFracH * sourceHeight) / 2) * 2
  const cropX = Math.floor(((sourceWidth - cropW) * Math.max(0, Math.min(1, interp.x))) / 2) * 2
  const cropY = Math.floor(((sourceHeight - cropH) * Math.max(0, Math.min(1, interp.y))) / 2) * 2

  return { cropW, cropH, cropX, cropY }
}

interface Segment {
  start: number
  end: number
  hasZoomChange: boolean
}

// Emit per-slice progress updates to renderer
function sendSliceProgress(
  mainWindow: BrowserWindow,
  payload: { sliceId: string; progress: number; state?: 'progress' | 'done' | 'error'; path?: string; error?: string }
) {
  const clamped = Math.max(0, Math.min(100, payload.progress))
  mainWindow.webContents.send('export:progress', { ...payload, progress: clamped })
}

// Request renderer to capture preview for a slice; returns video file path
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
    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      ipcMain.removeAllListeners(progressChannel)
      reject(new Error('Capture timed out'))
    }, 60_000)

    ipcMain.once(replyChannel, (_ev, data) => {
      clearTimeout(timeout)
      ipcMain.removeAllListeners(progressChannel)
      if (data?.error) return reject(new Error(data.error))
      if (!data?.path) return reject(new Error('No capture path'))
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

// Capture-based slow segment: renderer records preview; main muxes audio
async function exportSegmentSlow(
  project: Project,
  segment: Segment,
  outputPath: string,
  keyframes: Keyframe[],
  _tempDir: string,
  mainWindow: BrowserWindow,
  sliceId: string
): Promise<void> {
  const duration = segment.end - segment.start
  const fps = 30

  const capturePath = await requestPreviewCapture(mainWindow, {
    videoPath: project.videoPath,
    start: segment.start,
    end: segment.end,
    fps,
    outputWidth: project.outputWidth,
    outputHeight: project.outputHeight,
    keyframes,
    videoWidth: project.videoWidth,
    videoHeight: project.videoHeight,
  }, (pct) => {
    sendSliceProgress(mainWindow, { sliceId, progress: pct * 0.9 })
  })

  // Mux captured video with source audio slice
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(capturePath)
      .input(project.videoPath)
      .inputOptions([
        '-ss', String(segment.start),
        '-t', String(duration),
      ])
      .outputOptions([
        '-map', '0:v',
        '-map', '1:a?',
        '-c:v', 'libx264', // transcode VP9 webm to h264 mp4
        '-preset', 'veryfast',
        '-crf', '18',
        '-c:a', 'aac',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => {
        // Final bump to near completion; caller will send 100%
        sendSliceProgress(mainWindow, { sliceId, progress: 95 })
        resolve()
      })
      .on('error', (err: Error) => reject(err))
      .run()
  })
}

async function exportSegmentFast(
  project: Project,
  segment: Segment,
  outputPath: string,
  keyframes: Keyframe[]
): Promise<void> {
  // Use static crop at segment start
  const interp = interpolateAtTime(keyframes, segment.start)
  const crop = computeCropForFrame(
    interp,
    project.videoWidth,
    project.videoHeight,
    project.outputWidth,
    project.outputHeight
  )

  return new Promise((resolve, reject) => {
    ffmpeg(project.videoPath)
      .inputOptions([
        '-ss', String(segment.start),
        '-t', String(segment.end - segment.start),
      ])
      .outputOptions([
        '-vf', `crop=${crop.cropW}:${crop.cropH}:${crop.cropX}:${crop.cropY},scale=${project.outputWidth}:${project.outputHeight}`,
        '-c:v', 'h264_videotoolbox', // GPU acceleration on macOS
        '-b:v', '5M',
        '-c:a', 'aac',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })
}

async function exportSingleSlice(
  project: Project,
  slice: Slice,
  outputPath: string,
  mainWindow: BrowserWindow
): Promise<void> {
  const activeKeyframes = buildSliceKeyframes(project.keyframes, slice.start, slice.end)

  // Capture-based export for full slice (smooth zoom)
  const tempDir = path.join(os.tmpdir(), `reframe-export-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 0, state: 'progress' })

    await exportSegmentSlow(
      project,
      { start: slice.start, end: slice.end, hasZoomChange: true },
      outputPath,
      activeKeyframes,
      tempDir,
      mainWindow,
      slice.id
    )

    sendSliceProgress(mainWindow, { sliceId: slice.id, progress: 100, state: 'done', path: outputPath })
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

export async function exportVideo(
  args: { project: Project; slices?: Slice[] },
  outputDir: string,
  mainWindow: BrowserWindow
): Promise<string[]> {
  const { project, slices } = args
  const exportSlices = slices && slices.length > 0 ? slices : undefined

  const results: { sliceId: string; path: string }[] = []

  // No slices: export full trim range
  if (!exportSlices) {
    const slice: Slice = {
      id: 'full-trim',
      start: project.trim.start,
      end: project.trim.end,
      status: 'keep',
    }

    await exportSingleSlice(project, slice, outputDir, mainWindow)
    results.push({ sliceId: slice.id, path: outputDir })
    mainWindow.webContents.send('export:done', { paths: [outputDir], results })
    return [outputDir]
  }

  // Multi-slice export
  const outputPaths: string[] = []
  const total = exportSlices.length
  const CONCURRENCY = 3
  let index = 0

  const worker = async () => {
    while (true) {
      const currentIndex = index
      if (currentIndex >= total) break
      index += 1

      const slice = exportSlices[currentIndex]
      const baseName = outputDir.replace(/\.[^.]+$/, '')
      const slicePath = total === 1 ? outputDir : `${baseName}_slice-${currentIndex + 1}.mp4`

      await exportSingleSlice(project, slice, slicePath, mainWindow)

      outputPaths[currentIndex] = slicePath
      results.push({ sliceId: slice.id, path: slicePath })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
  await Promise.all(workers)

  mainWindow.webContents.send('export:done', { paths: outputPaths, results })
  return outputPaths
}