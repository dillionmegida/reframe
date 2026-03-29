import { BrowserWindow } from 'electron'
import ffmpeg from 'fluent-ffmpeg'
import { buildCropExpression } from '../src/utils/exportExpression'
import type { Project } from '../src/types'

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath)

export function exportVideo(
  args: { project: Project },
  outputPath: string,
  mainWindow: BrowserWindow
): Promise<void> {
  const { project } = args

  const activeKeyframes = project.keyframes.filter(
    (kf) => kf.timestamp >= project.trim.start && kf.timestamp <= project.trim.end
  )

  const cropExpr = buildCropExpression(
    activeKeyframes,
    project.trim,
    project.videoWidth,
    project.videoHeight,
    project.outputWidth,
    project.outputHeight
  )

  return new Promise((resolve, reject) => {
    ffmpeg(project.videoPath)
      .setStartTime(project.trim.start)
      .setDuration(project.trim.end - project.trim.start)
      .videoFilter(cropExpr)
      .audioCodec('copy')
      .videoCodec('libx264')
      .outputOptions(['-preset', 'medium', '-crf', '18'])
      .output(outputPath)
      .on('progress', (p: any) => {
        mainWindow.webContents.send('export:progress', p.percent || 0)
      })
      .on('end', () => {
        mainWindow.webContents.send('export:done', outputPath)
        resolve()
      })
      .on('error', (err: Error) => {
        reject(err)
      })
      .run()
  })
}
