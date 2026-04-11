import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEditorStore } from '../src/store/editorStore'
import type { VideoEntry, Keyframe } from '../src/types'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
})

function makeProject(overrides?: Partial<VideoEntry>): VideoEntry {
  return {
    id: 'test-video',
    projectId: 'test-project',
    videoPath: '/test/video.mp4',
    videoDuration: 30,
    videoWidth: 1920,
    videoHeight: 1080,
    videoFps: 30,
    outputRatio: '9:16',
    outputWidth: 1080,
    outputHeight: 1920,
    trim: { start: 0, end: 30 },
    keyframes: [],
    slices: [],
    addedAt: Date.now(),
    ...overrides,
  }
}

function kf(timestamp: number, x: number, y: number, scale: number, easing: Keyframe['easing'] = 'linear'): Omit<Keyframe, 'id'> {
  return { timestamp, x, y, scale, easing }
}

describe('editorStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // Reset store to initial state
    useEditorStore.setState({
      project: null,
      currentTime: 0,
      isPlaying: false,
      selectedKeyframeIds: [],
      selectedSliceId: null,
      past: [],
      future: [],
      tracking: {
        active: false,
        drawingBox: false,
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        untrackedRanges: [],
        results: [],
        sliceId: null,
        initialBbox: null,
      },
      trackingSettings: {
        minDuration: 1.0,
        defaultEasing: 'auto',
      },
    })
  })

  describe('loadProject', () => {
    it('loads project and resets state', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)

      const state = useEditorStore.getState()
      expect(state.project).not.toBeNull()
      expect(state.project!.id).toBe('test-video')
      expect(state.isPlaying).toBe(false)
      expect(state.selectedKeyframeIds).toEqual([])
      expect(state.past).toEqual([])
      expect(state.future).toEqual([])
    })

    it('restores playhead from localStorage', () => {
      localStorageMock.setItem('reframe.playhead.test-video', '15')
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      expect(useEditorStore.getState().currentTime).toBe(15)
    })

    it('clamps stored playhead to trim range', () => {
      localStorageMock.setItem('reframe.playhead.test-video', '50')
      const project = makeProject({ trim: { start: 5, end: 25 } })
      useEditorStore.getState().loadProject(project)
      expect(useEditorStore.getState().currentTime).toBe(25)
    })

    it('adds slices array for legacy data', () => {
      const project = makeProject()
      delete (project as any).slices
      useEditorStore.getState().loadProject(project)
      expect(useEditorStore.getState().project!.slices).toEqual([])
    })
  })

  describe('setCurrentTime', () => {
    it('clamps time to trim range', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 5, end: 25 } }))
      useEditorStore.getState().setCurrentTime(30)
      expect(useEditorStore.getState().currentTime).toBe(25)

      useEditorStore.getState().setCurrentTime(2)
      expect(useEditorStore.getState().currentTime).toBe(5)
    })

    it('does not update for negligible changes', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setCurrentTime(10)
      const spy = vi.fn()
      useEditorStore.subscribe(spy)
      useEditorStore.getState().setCurrentTime(10.0005) // < 0.001 diff
      expect(spy).not.toHaveBeenCalled()
    })

    it('persists to localStorage when not playing', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setCurrentTime(12.5)
      expect(localStorageMock.getItem('reframe.playhead.test-video')).toBe('12.5')
    })
  })

  describe('addOrUpdateKeyframe', () => {
    it('adds a new keyframe and sorts by timestamp', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.1, 0.2, 1.0))

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBe(2)
      expect(kfs[0].timestamp).toBe(2)
      expect(kfs[1].timestamp).toBe(5)
    })

    it('updates existing keyframe at same timestamp (within 0.1s)', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5.05, 0.8, 0.9, 2.0))

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBe(1)
      expect(kfs[0].x).toBe(0.8)
      expect(kfs[0].y).toBe(0.9)
    })

    it('creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      expect(useEditorStore.getState().past.length).toBe(1)
      expect(useEditorStore.getState().future.length).toBe(0)
    })

    it('preserves explicitScale flag', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe({ ...kf(5, 0.3, 0.4, 2.0), explicitScale: true })

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs[0].explicitScale).toBe(true)
    })
  })

  describe('updateKeyframe', () => {
    it('patches a keyframe by id', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const id = useEditorStore.getState().project!.keyframes[0].id

      useEditorStore.getState().updateKeyframe(id, { x: 0.9 })
      expect(useEditorStore.getState().project!.keyframes[0].x).toBe(0.9)
      expect(useEditorStore.getState().project!.keyframes[0].y).toBe(0.4) // unchanged
    })
  })

  describe('deleteKeyframe', () => {
    it('removes keyframe and clears selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const id = useEditorStore.getState().project!.keyframes[0].id

      useEditorStore.getState().selectKeyframe(id)
      useEditorStore.getState().deleteKeyframe(id)

      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([])
    })
  })

  describe('cloneKeyframeMinus', () => {
    it('clones from previous keyframe at offset before target', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.1, 0.2, 1.0))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.8, 0.9, 2.0))

      const id = useEditorStore.getState().project!.keyframes[1].id
      useEditorStore.getState().cloneKeyframeMinus(id, 1.0)

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBe(3)
      // New keyframe at t=4, with values from the previous kf (t=2)
      const cloned = kfs.find((k) => Math.abs(k.timestamp - 4) < 0.1)
      expect(cloned).toBeDefined()
      expect(cloned!.x).toBe(0.1)
      expect(cloned!.y).toBe(0.2)
    })

    it('clamps new timestamp to trim start', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 3, end: 30 } }))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3.5, 0.5, 0.5, 1.0))
      const id = useEditorStore.getState().project!.keyframes[0].id

      useEditorStore.getState().cloneKeyframeMinus(id, 2.0)
      const kfs = useEditorStore.getState().project!.keyframes
      const cloned = kfs.find((k) => k.id !== id)
      expect(cloned!.timestamp).toBeGreaterThanOrEqual(3)
    })
  })

  describe('trim', () => {
    it('setTrimStart filters out keyframes before new start', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.1, 0.2, 1.0))
      useEditorStore.getState().addOrUpdateKeyframe(kf(10, 0.5, 0.5, 1.0))

      useEditorStore.getState().setTrimStart(5)
      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBe(1)
      expect(kfs[0].timestamp).toBe(10)
    })

    it('setTrimEnd filters out keyframes after new end', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.1, 0.2, 1.0))
      useEditorStore.getState().addOrUpdateKeyframe(kf(20, 0.5, 0.5, 1.0))

      useEditorStore.getState().setTrimEnd(15)
      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBe(1)
      expect(kfs[0].timestamp).toBe(2)
    })

    it('setTrimStart clamps and adjusts currentTime', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setCurrentTime(3)
      useEditorStore.getState().setTrimStart(5)
      expect(useEditorStore.getState().currentTime).toBe(5)
    })

    it('setTrimEnd clamps and adjusts currentTime', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setCurrentTime(20)
      useEditorStore.getState().setTrimEnd(15)
      expect(useEditorStore.getState().currentTime).toBe(15)
    })

    it('setTrimStart cannot exceed trimEnd - 0.5', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 0, end: 10 } }))
      useEditorStore.getState().setTrimStart(10)
      expect(useEditorStore.getState().project!.trim.start).toBe(9.5)
    })
  })

  describe('undo / redo', () => {
    it('undo restores previous keyframes', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      expect(useEditorStore.getState().project!.keyframes.length).toBe(1)

      useEditorStore.getState().undo()
      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)
    })

    it('redo restores undone keyframes', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      useEditorStore.getState().undo()
      useEditorStore.getState().redo()
      expect(useEditorStore.getState().project!.keyframes.length).toBe(1)
    })

    it('new action clears future', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().future.length).toBe(1)

      useEditorStore.getState().addOrUpdateKeyframe(kf(10, 0.5, 0.5, 1.0))
      expect(useEditorStore.getState().future.length).toBe(0)
    })

    it('undo restores trim', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 0, end: 30 } }))
      useEditorStore.getState().setTrimStart(5)
      expect(useEditorStore.getState().project!.trim.start).toBe(5)

      useEditorStore.getState().undo()
      expect(useEditorStore.getState().project!.trim.start).toBe(0)
    })

    it('undo restores slices', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      expect(useEditorStore.getState().project!.slices.length).toBe(1)

      useEditorStore.getState().undo()
      expect(useEditorStore.getState().project!.slices.length).toBe(0)
    })

    it('undo cap: past limited to 50 entries', () => {
      useEditorStore.getState().loadProject(makeProject())
      for (let i = 0; i < 55; i++) {
        useEditorStore.getState().addOrUpdateKeyframe(kf(i * 0.2, 0.5, 0.5, 1.0))
      }
      expect(useEditorStore.getState().past.length).toBeLessThanOrEqual(50)
    })

    it('undo with no past does nothing', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)
    })

    it('redo with no future does nothing', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      useEditorStore.getState().redo()
      expect(useEditorStore.getState().project!.keyframes.length).toBe(1)
    })
  })

  describe('slices', () => {
    it('addSlice creates a slice at playhead, sorted by start', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(10)

      const slices = useEditorStore.getState().project!.slices
      expect(slices.length).toBe(1)
      expect(slices[0].start).toBe(10)
      expect(slices[0].end).toBe(15) // default 5s duration
      expect(slices[0].status).toBe('keep')
      expect(useEditorStore.getState().selectedSliceId).toBe(slices[0].id)
    })

    it('addSlice clamps to trim range', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 5, end: 12 } }))
      useEditorStore.getState().addSlice(10)

      const slices = useEditorStore.getState().project!.slices
      expect(slices[0].start).toBe(10)
      expect(slices[0].end).toBe(12) // clamped to trim end
    })

    it('updateSlice patches and re-sorts', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(10)
      useEditorStore.getState().addSlice(2)

      const slices = useEditorStore.getState().project!.slices
      // Sorted: [2, 10]
      expect(slices[0].start).toBe(2)

      const id = slices[1].id
      useEditorStore.getState().updateSlice(id, { start: 1 })
      const updated = useEditorStore.getState().project!.slices
      // After re-sort: [1, 2]
      expect(updated[0].start).toBe(1)
    })

    it('setSliceStatus changes status', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      const id = useEditorStore.getState().project!.slices[0].id

      useEditorStore.getState().setSliceStatus(id, 'hidden')
      expect(useEditorStore.getState().project!.slices[0].status).toBe('hidden')
    })

    it('deleteSlice removes and clears selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      const id = useEditorStore.getState().project!.slices[0].id

      useEditorStore.getState().deleteSlice(id)
      expect(useEditorStore.getState().project!.slices.length).toBe(0)
      expect(useEditorStore.getState().selectedSliceId).toBeNull()
    })
  })

  describe('keyframe selection', () => {
    it('selectKeyframe sets single selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const id = useEditorStore.getState().project!.keyframes[0].id

      useEditorStore.getState().selectKeyframe(id)
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([id])
    })

    it('selectKeyframe(null) clears selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const id = useEditorStore.getState().project!.keyframes[0].id
      useEditorStore.getState().selectKeyframe(id)
      useEditorStore.getState().selectKeyframe(null)
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([])
    })

    it('toggleKeyframeSelection with cmd toggles individual', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.1, 0.2, 1.0))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      useEditorStore.getState().selectKeyframe(ids[0])
      useEditorStore.getState().toggleKeyframeSelection(ids[1], true, false)
      expect(useEditorStore.getState().selectedKeyframeIds).toContain(ids[0])
      expect(useEditorStore.getState().selectedKeyframeIds).toContain(ids[1])

      // Toggle off
      useEditorStore.getState().toggleKeyframeSelection(ids[0], true, false)
      expect(useEditorStore.getState().selectedKeyframeIds).not.toContain(ids[0])
    })

    it('toggleKeyframeSelection with shift does range selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3, 0.3, 0.3, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.5, 0.5, 1))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      useEditorStore.getState().selectKeyframe(ids[0])
      useEditorStore.getState().toggleKeyframeSelection(ids[2], false, true)
      // Should select all 3
      expect(useEditorStore.getState().selectedKeyframeIds.length).toBe(3)
    })

    it('toggleKeyframeSelection without modifiers replaces selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.1, 0.2, 1.0))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      useEditorStore.getState().selectKeyframes(ids)
      useEditorStore.getState().toggleKeyframeSelection(ids[0], false, false)
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([ids[0]])
    })
  })

  describe('output settings', () => {
    it('setOutputRatio updates ratio and dimensions', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setOutputRatio('4:5', 1080, 1350)

      const p = useEditorStore.getState().project!
      expect(p.outputRatio).toBe('4:5')
      expect(p.outputWidth).toBe(1080)
      expect(p.outputHeight).toBe(1350)
    })

    it('setStabilization updates stabilization settings', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setStabilization(true, 15)

      const p = useEditorStore.getState().project!
      expect(p.stabilization?.enabled).toBe(true)
      expect(p.stabilization?.smoothing).toBe(15)
    })
  })

  describe('tracking', () => {
    it('startBoxDraw sets drawingBox and pauses', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setPlaying(true)
      useEditorStore.getState().startBoxDraw('slice-1')

      const state = useEditorStore.getState()
      expect(state.isPlaying).toBe(false)
      expect(state.tracking.drawingBox).toBe(true)
      expect(state.tracking.sliceId).toBe('slice-1')
    })

    it('cancelTracking resets all tracking state', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().startBoxDraw('slice-1')
      useEditorStore.getState().cancelTracking()

      const t = useEditorStore.getState().tracking
      expect(t.active).toBe(false)
      expect(t.drawingBox).toBe(false)
      expect(t.sliceId).toBeNull()
      expect(t.results).toEqual([])
    })

    it('beginTracking activates tracking', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().startBoxDraw('slice-1')
      useEditorStore.getState().beginTracking({ x: 10, y: 20, w: 100, h: 80 }, 0)

      const t = useEditorStore.getState().tracking
      expect(t.active).toBe(true)
      expect(t.drawingBox).toBe(false)
      expect(t.initialBbox).toEqual({ x: 10, y: 20, w: 100, h: 80 })
    })

    it('finishTracking stores results', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().beginTracking({ x: 10, y: 20, w: 100, h: 80 }, 0)

      const results = [
        { frame: 0, t: 0, x: 0.5, y: 0.5, confident: true },
        { frame: 1, t: 0.033, x: 0.51, y: 0.5, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])

      const t = useEditorStore.getState().tracking
      expect(t.active).toBe(false)
      expect(t.progress).toBe(100)
      expect(t.results.length).toBe(2)
    })

    it('applyTrackingAsKeyframes creates keyframes from results', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: true },
        { frame: 30, t: 1, x: 0.3, y: 0.3, confident: true },
        { frame: 60, t: 2, x: 0.5, y: 0.5, confident: true },
        { frame: 90, t: 3, x: 0.7, y: 0.7, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes(0.001)

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBeGreaterThanOrEqual(2)
      // All should have explicitScale
      kfs.forEach((k) => expect(k.explicitScale).toBe(true))
    })

    it('applyTrackingAsKeyframes filters by minDuration', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().setTrackingSettings({ minDuration: 2.0, defaultEasing: 'auto' })
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: true },
        { frame: 15, t: 0.5, x: 0.2, y: 0.2, confident: true },
        { frame: 30, t: 1, x: 0.3, y: 0.3, confident: true },
        { frame: 60, t: 2, x: 0.5, y: 0.5, confident: true },
        { frame: 120, t: 4, x: 0.9, y: 0.9, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes(0.001)

      const kfs = useEditorStore.getState().project!.keyframes
      // With minDuration=2, only points >= 2s apart should survive
      for (let i = 1; i < kfs.length; i++) {
        expect(kfs[i].timestamp - kfs[i - 1].timestamp).toBeGreaterThanOrEqual(1.9)
      }
    })

    it('applyTrackingAsKeyframes skips unconfident results', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: false },
        { frame: 30, t: 1, x: 0.3, y: 0.3, confident: false },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes()

      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)
    })

    it('applyTrackingAsKeyframes resets tracking state', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: true },
        { frame: 60, t: 2, x: 0.5, y: 0.5, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes()

      const t = useEditorStore.getState().tracking
      expect(t.active).toBe(false)
      expect(t.results.length).toBe(0)
      expect(t.sliceId).toBeNull()
    })
  })

  describe('closeProject', () => {
    it('resets all state', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      useEditorStore.getState().addSlice(10)
      useEditorStore.getState().closeProject()

      const state = useEditorStore.getState()
      expect(state.project).toBeNull()
      expect(state.currentTime).toBe(0)
      expect(state.past).toEqual([])
      expect(state.selectedKeyframeIds).toEqual([])
    })
  })
})
