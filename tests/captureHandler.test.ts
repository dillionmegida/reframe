import { describe, it, expect } from 'vitest'
import type { Keyframe } from '../src/types'
import { interpolateAtTime } from '../src/utils/interpolate'
import { computeCrop } from '../src/utils/computeCrop'

/**
 * Tests for the capture handler logic in capturePreview.ts.
 * We can't import handleCapture directly (it relies on DOM globals),
 * so we test the data flow: given a set of keyframes and frame times,
 * verify the correct crop parameters are computed for each frame,
 * and that the correct number of frames are generated.
 */

function kf(timestamp: number, x: number, y: number, scale: number, easing: Keyframe['easing'] = 'linear', explicitScale?: boolean): Keyframe {
  return { id: `kf-${timestamp}`, timestamp, x, y, scale, easing, explicitScale }
}

describe('capture handler logic', () => {
  const sourceW = 1920
  const sourceH = 1080
  const outputW = 1080
  const outputH = 1920
  const fps = 30

  describe('per-frame crop computation', () => {
    it('computes correct crop for each frame with moving keyframes', () => {
      const keyframes = [
        kf(0, 0, 0, 1, 'linear', true),
        kf(3, 1, 1, 2, 'linear', true),
      ]
      const start = 0
      const end = 3
      const frameDuration = 1 / fps
      const frameCount = Math.round((end - start) * fps)

      const crops: Array<{ cropW: number; cropH: number; cropX: number; cropY: number }> = []

      for (let i = 0; i < frameCount; i++) {
        const targetTime = start + i * frameDuration
        const interp = interpolateAtTime(keyframes, targetTime)
        const crop = computeCrop(interp, sourceW, sourceH, outputW, outputH)
        crops.push(crop)

        // All crops must be valid
        expect(crop.cropW).toBeGreaterThan(0)
        expect(crop.cropH).toBeGreaterThan(0)
        expect(crop.cropX).toBeGreaterThanOrEqual(0)
        expect(crop.cropY).toBeGreaterThanOrEqual(0)
        expect(crop.cropX + crop.cropW).toBeLessThanOrEqual(sourceW + 1)
        expect(crop.cropY + crop.cropH).toBeLessThanOrEqual(sourceH + 1)
      }

      // Crop should change between first and last frames
      expect(crops[0].cropW).not.toBeCloseTo(crops[crops.length - 1].cropW, 0)
    })

    it('static keyframe produces identical crops for all frames', () => {
      const keyframes = [kf(0, 0.5, 0.5, 1.5)]
      const start = 0
      const end = 1
      const frameDuration = 1 / fps
      const frameCount = Math.round((end - start) * fps)

      const firstInterp = interpolateAtTime(keyframes, start)
      const firstCrop = computeCrop(firstInterp, sourceW, sourceH, outputW, outputH)

      for (let i = 1; i < frameCount; i++) {
        const targetTime = start + i * frameDuration
        const interp = interpolateAtTime(keyframes, targetTime)
        const crop = computeCrop(interp, sourceW, sourceH, outputW, outputH)
        expect(crop.cropW).toBeCloseTo(firstCrop.cropW)
        expect(crop.cropH).toBeCloseTo(firstCrop.cropH)
        expect(crop.cropX).toBeCloseTo(firstCrop.cropX)
        expect(crop.cropY).toBeCloseTo(firstCrop.cropY)
      }
    })
  })

  describe('crop matches output aspect ratio', () => {
    it('every frame crop has correct aspect ratio', () => {
      const keyframes = [kf(0, 0.2, 0.3, 1.5), kf(2, 0.8, 0.7, 2.5)]
      const start = 0
      const end = 2
      const frameDuration = 1 / fps
      const frameCount = Math.round((end - start) * fps)
      const expectedAspect = outputW / outputH

      for (let i = 0; i < frameCount; i++) {
        const targetTime = start + i * frameDuration
        const interp = interpolateAtTime(keyframes, targetTime)
        const crop = computeCrop(interp, sourceW, sourceH, outputW, outputH)
        const cropAspect = crop.cropW / crop.cropH
        expect(cropAspect).toBeCloseTo(expectedAspect, 2)
      }
    })
  })

  describe('drawImage argument validation', () => {
    it('crop region fits within source video bounds', () => {
      const keyframes = [
        kf(0, 0, 0, 1),       // top-left
        kf(1, 1, 1, 3),       // bottom-right, zoomed in
        kf(2, 0.5, 0.5, 1),   // center
      ]
      const start = 0
      const end = 2
      const frameDuration = 1 / fps
      const frameCount = Math.round((end - start) * fps)

      for (let i = 0; i < frameCount; i++) {
        const targetTime = start + i * frameDuration
        const interp = interpolateAtTime(keyframes, targetTime)
        const crop = computeCrop(interp, sourceW, sourceH, outputW, outputH)

        // These are the args that would go to ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outputW, outputH)
        expect(crop.cropX).toBeGreaterThanOrEqual(-1)
        expect(crop.cropY).toBeGreaterThanOrEqual(-1)
        expect(crop.cropW).toBeGreaterThan(0)
        expect(crop.cropH).toBeGreaterThan(0)
        // crop region should not extend far past source bounds
        expect(crop.cropX + crop.cropW).toBeLessThanOrEqual(sourceW + 1)
        expect(crop.cropY + crop.cropH).toBeLessThanOrEqual(sourceH + 1)
      }
    })
  })

})
