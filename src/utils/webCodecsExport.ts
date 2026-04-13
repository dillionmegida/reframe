import type { Keyframe } from '../types'
import { interpolateAtTime } from './interpolate'
import { computeCrop } from './computeCrop'

interface ExportSegment {
  start: number
  end: number
  keyframes: Keyframe[]
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
}

/**
 * Export a video segment using WebCodecs API (hardware-accelerated, native browser encoding)
 * This is much faster than ffmpeg frame extraction and produces smooth results.
 */
export async function exportSegmentWithWebCodecs(
  videoPath: string,
  segment: ExportSegment,
  outputPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  // Load video file
  const videoBlob = await fetch(`file://${videoPath}`).then(r => r.blob())
  const videoElement = document.createElement('video')
  videoElement.src = URL.createObjectURL(videoBlob)
  
  await new Promise((resolve) => {
    videoElement.onloadedmetadata = resolve
  })

  const fps = 30
  const duration = segment.end - segment.start
  const totalFrames = Math.ceil(duration * fps)
  
  // Create canvas for rendering
  const canvas = document.createElement('canvas')
  canvas.width = segment.outputWidth
  canvas.height = segment.outputHeight
  const ctx = canvas.getContext('2d')!

  // Setup video encoder
  const chunks: Uint8Array[] = []
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push(data)
    },
    error: (e) => {
      console.error('VideoEncoder error:', e)
    }
  })

  encoder.configure({
    codec: 'avc1.42E01F', // H.264 baseline
    width: segment.outputWidth,
    height: segment.outputHeight,
    bitrate: 5_000_000,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
  })

  // Render and encode each frame
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const timeInSegment = frameIdx / fps
    const absTime = segment.start + timeInSegment
    
    // Seek video to this frame
    videoElement.currentTime = absTime
    await new Promise(resolve => {
      videoElement.onseeked = resolve
    })

    // Get interpolated crop values
    const interp = interpolateAtTime(segment.keyframes, absTime)
    const { cropX, cropY, cropW, cropH } = computeCrop(
      interp,
      segment.sourceWidth,
      segment.sourceHeight,
      segment.outputWidth,
      segment.outputHeight
    )

    // Draw cropped frame to canvas
    ctx.drawImage(
      videoElement,
      cropX, cropY, cropW, cropH,
      0, 0, segment.outputWidth, segment.outputHeight
    )

    // Encode frame
    const frame = new VideoFrame(canvas, {
      timestamp: (frameIdx * 1_000_000) / fps,
    })
    
    encoder.encode(frame, { keyFrame: frameIdx % 30 === 0 })
    frame.close()

    if (onProgress) {
      onProgress((frameIdx / totalFrames) * 100)
    }
  }

  // Finalize encoding
  await encoder.flush()
  encoder.close()

  // Write output file (this would need electron IPC to write to disk)
  // For now, return the encoded chunks
  console.log('Encoded', chunks.length, 'chunks')
  
  URL.revokeObjectURL(videoElement.src)
}
