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

describe('editorStore – extra coverage', () => {
  beforeEach(() => {
    localStorageMock.clear()
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

  // ------- Playback persistence -------

  describe('playback persistence', () => {
    it('setCurrentTime does NOT persist while playing', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setPlaying(true)
      useEditorStore.getState().setCurrentTime(15)

      // The value should update in state
      expect(useEditorStore.getState().currentTime).toBe(15)
      // But localStorage should NOT have been written during playback
      // (it was written when loadProject set initial time)
      expect(localStorageMock.getItem('reframe.playhead.test-video')).not.toBe('15')
    })

    it('setPlaying(false) persists current playhead', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setPlaying(true)
      useEditorStore.getState().setCurrentTime(18)
      useEditorStore.getState().setPlaying(false)

      expect(localStorageMock.getItem('reframe.playhead.test-video')).toBe('18')
    })

    it('setCurrentTime with no project is a no-op', () => {
      useEditorStore.getState().setCurrentTime(10)
      expect(useEditorStore.getState().currentTime).toBe(0)
    })
  })

  // ------- Trim edge cases -------

  describe('trim edge cases', () => {
    it('setTrimEnd cannot go below trimStart + 0.5', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 5, end: 30 } }))
      useEditorStore.getState().setTrimEnd(5)
      expect(useEditorStore.getState().project!.trim.end).toBe(5.5)
    })

    it('setTrimEnd is clamped to videoDuration', () => {
      useEditorStore.getState().loadProject(makeProject({ videoDuration: 30 }))
      useEditorStore.getState().setTrimEnd(50)
      expect(useEditorStore.getState().project!.trim.end).toBe(30)
    })

    it('setTrimStart cannot go below 0', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setTrimStart(-5)
      expect(useEditorStore.getState().project!.trim.start).toBe(0)
    })

    it('setTrimStart preserves currentTime if still within range', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setCurrentTime(10)
      useEditorStore.getState().setTrimStart(5)
      expect(useEditorStore.getState().currentTime).toBe(10)
    })

    it('setTrimEnd preserves currentTime if still within range', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setCurrentTime(10)
      useEditorStore.getState().setTrimEnd(20)
      expect(useEditorStore.getState().currentTime).toBe(10)
    })

    it('setTrimStart creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setTrimStart(5)
      expect(useEditorStore.getState().past.length).toBe(1)
    })

    it('setTrimEnd creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setTrimEnd(20)
      expect(useEditorStore.getState().past.length).toBe(1)
    })
  })

  // ------- Slice edge cases -------

  describe('slice edge cases', () => {
    it('addSlice at very end of trim creates minimal slice', () => {
      useEditorStore.getState().loadProject(makeProject({ trim: { start: 0, end: 10 } }))
      useEditorStore.getState().addSlice(10)

      const slices = useEditorStore.getState().project!.slices
      expect(slices.length).toBe(1)
      // When playhead is at trim end, slice gets a small positive duration
      expect(slices[0].end).toBe(10)
      expect(slices[0].start).toBeLessThan(10)
    })

    it('addSlice creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      expect(useEditorStore.getState().past.length).toBe(1)
    })

    it('updateSlice creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      const id = useEditorStore.getState().project!.slices[0].id
      useEditorStore.getState().updateSlice(id, { end: 20 })
      expect(useEditorStore.getState().past.length).toBe(2)
    })

    it('setSliceStatus does NOT create undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      const pastBefore = useEditorStore.getState().past.length
      const id = useEditorStore.getState().project!.slices[0].id
      useEditorStore.getState().setSliceStatus(id, 'hidden')
      expect(useEditorStore.getState().past.length).toBe(pastBefore)
    })

    it('deleteSlice creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      const id = useEditorStore.getState().project!.slices[0].id
      useEditorStore.getState().deleteSlice(id)
      expect(useEditorStore.getState().past.length).toBe(2) // addSlice + deleteSlice
    })

    it('deleteSlice preserves selection of other slices', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(2)
      useEditorStore.getState().addSlice(15)

      const slices = useEditorStore.getState().project!.slices
      const firstId = slices[0].id
      const secondId = slices[1].id

      useEditorStore.getState().selectSlice(firstId)
      useEditorStore.getState().deleteSlice(secondId)

      expect(useEditorStore.getState().selectedSliceId).toBe(firstId)
    })

    it('multiple slices are sorted by start time', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(15)
      useEditorStore.getState().addSlice(5)
      useEditorStore.getState().addSlice(10)

      const slices = useEditorStore.getState().project!.slices
      for (let i = 1; i < slices.length; i++) {
        expect(slices[i].start).toBeGreaterThanOrEqual(slices[i - 1].start)
      }
    })

    it('selectSlice sets selectedSliceId', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5)
      const id = useEditorStore.getState().project!.slices[0].id

      useEditorStore.getState().selectSlice(null)
      expect(useEditorStore.getState().selectedSliceId).toBeNull()

      useEditorStore.getState().selectSlice(id)
      expect(useEditorStore.getState().selectedSliceId).toBe(id)
    })
  })

  // ------- Selection edge cases -------

  describe('keyframe selection edge cases', () => {
    it('shift-click with empty selection replaces (no range)', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3, 0.3, 0.3, 1))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      // Shift with no prior selection → falls through to single select
      useEditorStore.getState().toggleKeyframeSelection(ids[1], false, true)
      // selectedKeyframeIds.length === 0, so shift branch is skipped → single select
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([ids[1]])
    })

    it('shift-click backward selects correct range', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3, 0.3, 0.3, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.5, 0.5, 1))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      // Select last, then shift-click first (backward)
      useEditorStore.getState().selectKeyframe(ids[2])
      useEditorStore.getState().toggleKeyframeSelection(ids[0], false, true)
      expect(useEditorStore.getState().selectedKeyframeIds.length).toBe(3)
    })

    it('cmd-click adds to existing selection without duplicates', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      useEditorStore.getState().selectKeyframe(ids[0])
      // Cmd-click the same keyframe again
      useEditorStore.getState().toggleKeyframeSelection(ids[0], true, false)
      // Should toggle off
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([])
    })

    it('deleteKeyframe removes id from multi-selection', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3, 0.3, 0.3, 1))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      useEditorStore.getState().selectKeyframes(ids)
      expect(useEditorStore.getState().selectedKeyframeIds.length).toBe(2)

      useEditorStore.getState().deleteKeyframe(ids[0])
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([ids[1]])
    })

    it('selectKeyframes sets multiple ids directly', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3, 0.3, 0.3, 1))
      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)

      useEditorStore.getState().selectKeyframes(ids)
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(ids)

      useEditorStore.getState().selectKeyframes([])
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual([])
    })
  })

  // ------- Undo/redo complex chains -------

  describe('undo/redo complex chains', () => {
    it('undo 3x then redo 1x then new action clears remaining future', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(1, 0.1, 0.1, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(2, 0.2, 0.2, 1))
      useEditorStore.getState().addOrUpdateKeyframe(kf(3, 0.3, 0.3, 1))

      // Past has 3 snapshots (one per add)
      expect(useEditorStore.getState().past.length).toBe(3)

      useEditorStore.getState().undo() // removes kf at t=3
      useEditorStore.getState().undo() // removes kf at t=2
      useEditorStore.getState().undo() // removes kf at t=1

      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)
      expect(useEditorStore.getState().future.length).toBe(3)

      useEditorStore.getState().redo() // restores kf at t=1
      expect(useEditorStore.getState().project!.keyframes.length).toBe(1)
      expect(useEditorStore.getState().future.length).toBe(2)

      // New action should clear remaining future
      useEditorStore.getState().addOrUpdateKeyframe(kf(10, 0.5, 0.5, 1))
      expect(useEditorStore.getState().future.length).toBe(0)
      expect(useEditorStore.getState().project!.keyframes.length).toBe(2)
    })

    it('undo restores slice state along with keyframes', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addSlice(5) // snapshot 1
      useEditorStore.getState().addOrUpdateKeyframe(kf(7, 0.5, 0.5, 1)) // snapshot 2

      expect(useEditorStore.getState().project!.slices.length).toBe(1)
      expect(useEditorStore.getState().project!.keyframes.length).toBe(1)

      useEditorStore.getState().undo() // undo keyframe add → slices still 1
      expect(useEditorStore.getState().project!.slices.length).toBe(1)
      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)

      useEditorStore.getState().undo() // undo slice add → slices 0
      expect(useEditorStore.getState().project!.slices.length).toBe(0)
    })

    it('undo cap drops oldest entry', () => {
      useEditorStore.getState().loadProject(makeProject())
      // Create 52 undo entries
      for (let i = 0; i < 52; i++) {
        useEditorStore.getState().addOrUpdateKeyframe(kf(i * 0.2, 0.5, 0.5, 1.0))
      }
      const pastLen = useEditorStore.getState().past.length
      expect(pastLen).toBeLessThanOrEqual(50)

      // Can undo exactly pastLen times
      for (let i = 0; i < pastLen; i++) {
        useEditorStore.getState().undo()
      }
      // One more undo should be a no-op
      const kfsBefore = useEditorStore.getState().project!.keyframes.length
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().project!.keyframes.length).toBe(kfsBefore)
    })
  })

  // ------- cloneKeyframeMinus edge cases -------

  describe('cloneKeyframeMinus edge cases', () => {
    it('falls back to current keyframe when no previous exists', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.8, 0.9, 2.0))
      const id = useEditorStore.getState().project!.keyframes[0].id

      useEditorStore.getState().cloneKeyframeMinus(id, 1.0)

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs.length).toBe(2)
      const cloned = kfs.find((k) => k.id !== id)!
      expect(cloned.timestamp).toBe(4)
      // Should copy from current kf (no previous)
      expect(cloned.x).toBe(0.8)
      expect(cloned.y).toBe(0.9)
    })

    it('ignores non-existent keyframe id', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.8, 0.9, 2.0))

      useEditorStore.getState().cloneKeyframeMinus('nonexistent', 1.0)
      expect(useEditorStore.getState().project!.keyframes.length).toBe(1)
    })

    it('updates existing keyframe if one already exists at target timestamp', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(4, 0.1, 0.2, 1.0))
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.8, 0.9, 2.0))

      const ids = useEditorStore.getState().project!.keyframes.map((k) => k.id)
      // Clone from kf at t=5 with offset 1 → target is t=4, which already has a kf
      useEditorStore.getState().cloneKeyframeMinus(ids[1], 1.0)

      const kfs = useEditorStore.getState().project!.keyframes
      // Should NOT create a third keyframe — should update existing at t=4
      expect(kfs.length).toBe(2)
      const updated = kfs.find((k) => Math.abs(k.timestamp - 4) < 0.1)!
      // Values come from the previous kf (t=4 itself) since it's the "prev" in sorted order
      expect(updated.x).toBe(0.1)
    })

    it('creates undo snapshot', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.8, 0.9, 2.0))
      const id = useEditorStore.getState().project!.keyframes[0].id
      const pastBefore = useEditorStore.getState().past.length

      useEditorStore.getState().cloneKeyframeMinus(id, 1.0)
      expect(useEditorStore.getState().past.length).toBe(pastBefore + 1)
    })
  })

  // ------- addOrUpdateKeyframe edge cases -------

  describe('addOrUpdateKeyframe edge cases', () => {
    it('defaults easing to ease-in-out', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe({ timestamp: 5, x: 0.5, y: 0.5, scale: 1, easing: 'ease-in-out' })

      const kfs = useEditorStore.getState().project!.keyframes
      expect(kfs[0].easing).toBe('ease-in-out')
    })

    it('preserves id when updating existing keyframe', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.3, 0.4, 1.5))
      const originalId = useEditorStore.getState().project!.keyframes[0].id

      useEditorStore.getState().addOrUpdateKeyframe(kf(5.05, 0.8, 0.9, 2.0))
      expect(useEditorStore.getState().project!.keyframes[0].id).toBe(originalId)
    })

    it('no-ops without a loaded project', () => {
      useEditorStore.getState().addOrUpdateKeyframe(kf(5, 0.5, 0.5, 1))
      expect(useEditorStore.getState().project).toBeNull()
    })
  })

  // ------- Tracking extra coverage -------

  describe('tracking extra coverage', () => {
    it('updateTrackingProgress updates progress fields', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().beginTracking({ x: 10, y: 20, w: 100, h: 80 }, 0)

      useEditorStore.getState().updateTrackingProgress(50, 15, 30)

      const t = useEditorStore.getState().tracking
      expect(t.progress).toBe(50)
      expect(t.currentFrame).toBe(15)
      expect(t.totalFrames).toBe(30)
    })

    it('retrackFromFrame resets to drawing state', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().beginTracking({ x: 10, y: 20, w: 100, h: 80 }, 0)
      useEditorStore.getState().finishTracking(
        [{ frame: 0, t: 0, x: 0.5, y: 0.5, confident: true }],
        []
      )

      useEditorStore.getState().retrackFromFrame(10)

      const t = useEditorStore.getState().tracking
      expect(t.drawingBox).toBe(true)
      expect(t.active).toBe(false)
      expect(t.results).toEqual([])
      expect(t.untrackedRanges).toEqual([])
    })

    it('setTrackingSettings updates settings', () => {
      useEditorStore.getState().setTrackingSettings({ minDuration: 2.0, defaultEasing: 'linear' })

      const settings = useEditorStore.getState().trackingSettings
      expect(settings.minDuration).toBe(2.0)
      expect(settings.defaultEasing).toBe('linear')
    })

    it('applyTrackingAsKeyframes auto easing uses ease-in-out for short gaps', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().setTrackingSettings({ minDuration: 0.5, defaultEasing: 'auto' })
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      // Points with short gaps (< 2s)
      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: true },
        { frame: 15, t: 0.5, x: 0.2, y: 0.2, confident: true },
        { frame: 30, t: 1.0, x: 0.3, y: 0.3, confident: true },
        { frame: 45, t: 1.5, x: 0.4, y: 0.4, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes(0.001)

      const kfs = useEditorStore.getState().project!.keyframes
      // Short gaps → auto should pick ease-in-out
      kfs.forEach((k) => expect(k.easing).toBe('ease-in-out'))
    })

    it('applyTrackingAsKeyframes uses explicit easing when not auto', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().setTrackingSettings({ minDuration: 0.5, defaultEasing: 'linear' })
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: true },
        { frame: 30, t: 1.0, x: 0.3, y: 0.3, confident: true },
        { frame: 60, t: 2.0, x: 0.5, y: 0.5, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes(0.001)

      const kfs = useEditorStore.getState().project!.keyframes
      kfs.forEach((k) => expect(k.easing).toBe('linear'))
    })

    it('applyTrackingAsKeyframes auto easing uses linear for medium gaps', () => {
      const project = makeProject()
      useEditorStore.getState().loadProject(project)
      useEditorStore.getState().setTrackingSettings({ minDuration: 0.5, defaultEasing: 'auto' })
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      // Points with medium gaps (2-4s)
      const results = [
        { frame: 0, t: 0, x: 0.1, y: 0.1, confident: true },
        { frame: 90, t: 3.0, x: 0.3, y: 0.3, confident: true },
        { frame: 180, t: 6.0, x: 0.5, y: 0.5, confident: true },
        { frame: 270, t: 9.0, x: 0.7, y: 0.7, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes(0.001)

      const kfs = useEditorStore.getState().project!.keyframes
      // Medium gaps (avg ~3s) → auto should pick linear for middle keyframes
      // The middle keyframes should have linear easing
      const middleKfs = kfs.filter(
        (k) => k.timestamp > 0 && k.timestamp < 9
      )
      middleKfs.forEach((k) => expect(k.easing).toBe('linear'))
    })

    it('applyTrackingAsKeyframes with no results is a no-op', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().beginTracking({ x: 10, y: 20, w: 100, h: 80 }, 0)
      useEditorStore.getState().finishTracking([], [])
      useEditorStore.getState().applyTrackingAsKeyframes()

      expect(useEditorStore.getState().project!.keyframes.length).toBe(0)
    })

    it('applyTrackingAsKeyframes appends to existing keyframes', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().addOrUpdateKeyframe(kf(0, 0.5, 0.5, 1.0))
      useEditorStore.getState().beginTracking({ x: 100, y: 100, w: 200, h: 150 }, 0)

      const results = [
        { frame: 0, t: 5, x: 0.2, y: 0.2, confident: true },
        { frame: 30, t: 6, x: 0.3, y: 0.3, confident: true },
        { frame: 60, t: 7, x: 0.4, y: 0.4, confident: true },
      ]
      useEditorStore.getState().finishTracking(results, [])
      useEditorStore.getState().applyTrackingAsKeyframes(0.001)

      const kfs = useEditorStore.getState().project!.keyframes
      // Should have original + new tracking keyframes
      expect(kfs.length).toBeGreaterThan(1)
      expect(kfs[0].timestamp).toBe(0)
    })
  })

  // ------- Output settings edge cases -------

  describe('output settings edge cases', () => {
    it('setOutputRatio no-ops without project', () => {
      useEditorStore.getState().setOutputRatio('1:1', 1080, 1080)
      expect(useEditorStore.getState().project).toBeNull()
    })

    it('setStabilization defaults smoothing to 10', () => {
      useEditorStore.getState().loadProject(makeProject())
      useEditorStore.getState().setStabilization(true)

      expect(useEditorStore.getState().project!.stabilization?.smoothing).toBe(10)
    })
  })
})
