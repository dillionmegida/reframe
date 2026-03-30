import { BrowserWindow } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import { buildCropExpression } from '../src/utils/exportExpression'
import { interpolateAtTime } from '../src/utils/interpolate'
import type { Project, Slice, Keyframe } from '../src/types'

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

function exportSingleSlice(
  project: Project,
  slice: Slice,
  outputPath: string,
  mainWindow: BrowserWindow,
  progressOffset: number,
  progressScale: number
): Promise<void> {
  const sliceTrim = { start: slice.start, end: slice.end }
  const activeKeyframes = buildSliceKeyframes(project.keyframes, slice.start, slice.end)

  const cropExpr = buildCropExpression(
    activeKeyframes,
    sliceTrim,
    project.videoWidth,
    project.videoHeight,
    project.outputWidth,
    project.outputHeight
  )

  console.log('[Export] Source dims:', project.videoWidth, 'x', project.videoHeight)
  console.log('[Export] Output dims:', project.outputWidth, 'x', project.outputHeight)
  console.log('[Export] Slice:', slice.start, '→', slice.end)
  console.log('[Export] Filter (first 300 chars):', cropExpr.substring(0, 300))

  return new Promise((resolve, reject) => {
    ffmpeg(project.videoPath)
      .inputOptions([
        '-ss', String(slice.start),
        '-t', String(slice.end - slice.start),
      ])
      .outputOptions([
        '-vf', cropExpr,
        '-preset', 'medium',
        '-crf', '18',
      ])
      .audioCodec('aac')
      .videoCodec('libx264')
      .output(outputPath)
      .on('progress', (p: any) => {
        const slicePct = p.percent ?? 0
        const overallPct = progressOffset + slicePct * progressScale
        mainWindow.webContents.send('export:progress', overallPct)
      })
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run()
  })
}

export async function exportVideo(
  args: { project: Project; slices?: Slice[] },
  outputDir: string,
  mainWindow: BrowserWindow
): Promise<string[]> {
  const { project, slices } = args
  const exportSlices = slices && slices.length > 0 ? slices : undefined

  // No slices: export full trim range
  if (!exportSlices) {
    const sliceTrim = { start: project.trim.start, end: project.trim.end }
    const activeKeyframes = buildSliceKeyframes(
      project.keyframes,
      project.trim.start,
      project.trim.end
    )

    const cropExpr = buildCropExpression(
      activeKeyframes,
      sliceTrim,
      project.videoWidth,
      project.videoHeight,
      project.outputWidth,
      project.outputHeight
    )

    console.log('[Export] Source dims:', project.videoWidth, 'x', project.videoHeight)
    console.log('[Export] Output dims:', project.outputWidth, 'x', project.outputHeight)
    console.log('[Export] Trim:', project.trim.start, '→', project.trim.end)
    console.log('[Export] Filter (first 300 chars):', cropExpr.substring(0, 300))

    return new Promise((resolve, reject) => {
      ffmpeg(project.videoPath)
        .inputOptions([
          '-ss', String(project.trim.start),
          '-t', String(project.trim.end - project.trim.start),
        ])
        .outputOptions([
          '-vf', cropExpr,
          '-preset', 'medium',
          '-crf', '18',
        ])
        .audioCodec('aac')
        .videoCodec('libx264')
        .output(outputDir)
        .on('progress', (p: any) => {
          mainWindow.webContents.send('export:progress', p.percent ?? 0)
        })
        .on('end', () => {
          mainWindow.webContents.send('export:done', outputDir)
          resolve([outputDir])
        })
        .on('error', (err: Error) => reject(err))
        .run()
    })
  }

  // Multi-slice export
  const outputPaths: string[] = []
  const total = exportSlices.length

  for (let i = 0; i < total; i++) {
    const slice = exportSlices[i]
    const baseName = outputDir.replace(/\.[^.]+$/, '')
    const slicePath = total === 1 ? outputDir : `${baseName}_slice-${i + 1}.mp4`

    await exportSingleSlice(
      project,
      slice,
      slicePath,
      mainWindow,
      (i / total) * 100,
      1 / total
    )

    outputPaths.push(slicePath)
  }

  mainWindow.webContents.send('export:done', outputPaths.join(', '))
  return outputPaths
}