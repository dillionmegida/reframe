import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Keyframe, VideoEntry, TrimRange, Slice, SliceStatus, TrackResult, UntrackedRange, TrackingState, EasingType } from '../types'
import { ramerDouglasPeucker } from '../utils/rdp'

let pendingSliceUndoTimer: ReturnType<typeof setTimeout> | null = null
let pendingSliceSnapshot: { keyframes: Keyframe[], trim: TrimRange, slices: Slice[] } | null = null

export type AutoEasingType = 'auto' | EasingType

export interface TrackingSettings {
  minDuration: number
  defaultEasing: AutoEasingType
}

type Project = VideoEntry

const PLAYHEAD_STORAGE_PREFIX = 'reframe.playhead.'

function readStoredPlayhead(videoId: string, trimStart: number, trimEnd: number): number {
  if (typeof window === 'undefined') return trimStart
  try {
    const raw = window.localStorage.getItem(PLAYHEAD_STORAGE_PREFIX + videoId)
    if (!raw) return trimStart
    const parsed = parseFloat(raw)
    if (!Number.isFinite(parsed)) return trimStart
    return Math.max(trimStart, Math.min(trimEnd, parsed))
  } catch {
    return trimStart
  }
}

function writeStoredPlayhead(videoId: string, t: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PLAYHEAD_STORAGE_PREFIX + videoId, t.toString())
  } catch {
    // ignore storage errors
  }
}

interface UndoSnapshot {
  keyframes: Keyframe[]
  trim: TrimRange
  slices: Slice[]
}

interface EditorState {
  project: Project | null
  currentTime: number
  isPlaying: boolean
  selectedKeyframeIds: string[]
  selectedSliceId: string | null
  past: UndoSnapshot[]
  future: UndoSnapshot[]
  tracking: TrackingState
  trackingSettings: TrackingSettings

  loadProject: (project: Project) => void
  setCurrentTime: (t: number) => void
  setPlaying: (v: boolean) => void
  selectKeyframe: (id: string | null) => void
  selectKeyframes: (ids: string[]) => void
  toggleKeyframeSelection: (id: string, isCmd: boolean, isShift: boolean) => void

  addOrUpdateKeyframe: (kf: Omit<Keyframe, 'id'> & { explicitScale?: boolean }) => void
  updateKeyframe: (id: string, patch: Partial<Keyframe>) => void
  deleteKeyframe: (id: string) => void
  cloneKeyframeMinus: (id: string, offsetSeconds?: number) => void

  setTrimStart: (t: number) => void
  setTrimEnd: (t: number) => void

  setOutputRatio: (ratio: Project['outputRatio'], width: number, height: number) => void
  setStabilization: (enabled: boolean, smoothing?: number) => void

  // Slice actions
  addSlice: (atTime: number) => void
  selectSlice: (id: string | null) => void
  updateSlice: (id: string, patch: Partial<Slice>) => void
  setSliceStatus: (id: string, status: SliceStatus) => void
  deleteSlice: (id: string) => void

  startBoxDraw: (sliceId: string) => void
  cancelTracking: () => void
  beginTracking: (bbox: { x: number; y: number; w: number; h: number }, frameStart: number) => void
  updateTrackingProgress: (progress: number, currentFrame: number, totalFrames: number) => void
  finishTracking: (results: TrackResult[], untrackedRanges: UntrackedRange[]) => void
  applyTrackingAsKeyframes: (epsilon?: number) => void
  retrackFromFrame: (frameIndex: number) => void
  setTrackingSettings: (settings: TrackingSettings) => void

  closeProject: () => void
  undo: () => void
  redo: () => void
}

function deepCopyKeyframes(kfs: Keyframe[]): Keyframe[] {
  return kfs.map((kf) => ({ ...kf }))
}

function sortKeyframes(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.timestamp - b.timestamp)
}

function deepCopySlices(slices: Slice[]): Slice[] {
  return slices.map((s) => ({ ...s }))
}

function pushUndo(past: UndoSnapshot[], keyframes: Keyframe[], trim: TrimRange, slices: Slice[]): UndoSnapshot[] {
  const snapshot: UndoSnapshot = {
    keyframes: deepCopyKeyframes(keyframes),
    trim: { ...trim },
    slices: deepCopySlices(slices),
  }
  const newPast = [...past, snapshot]
  if (newPast.length > 50) newPast.shift()
  return newPast
}

export const useEditorStore = create<EditorState>((set, get) => ({
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

  loadProject: (project) => {
    // Ensure slices array exists for legacy data
    const p = { ...project, slices: project.slices || [] }
    const storedPlayhead = readStoredPlayhead(p.id, p.trim.start, p.trim.end)
    set({
      project: p,
      currentTime: storedPlayhead,
      isPlaying: false,
      selectedKeyframeIds: [],
      selectedSliceId: null,
      past: [],
      future: [],
    })
  },

  setCurrentTime: (t) => {
    const { project, currentTime, isPlaying } = get()
    if (!project) return
    const clamped = Math.max(project.trim.start, Math.min(project.trim.end, t))
    if (Math.abs(clamped - currentTime) < 0.001) return
    // Avoid per-frame storage writes while playing; persist on pause instead
    if (!isPlaying) {
      writeStoredPlayhead(project.id, clamped)
    }
    set({ currentTime: clamped })
  },

  setPlaying: (v) => {
    const state = get()
    set({ isPlaying: v })
    if (!v && state.project) {
      writeStoredPlayhead(state.project.id, state.currentTime)
    }
  },

  selectKeyframe: (id) => set({ selectedKeyframeIds: id ? [id] : [] }),

  selectKeyframes: (ids) => set({ selectedKeyframeIds: ids }),

  toggleKeyframeSelection: (id, isCmd, isShift) => {
    const { project, selectedKeyframeIds } = get()
    if (!project) return

    if (isShift && selectedKeyframeIds.length > 0) {
      // Range selection: select all keyframes between last selected and current
      const sortedKeyframes = sortKeyframes([...project.keyframes])
      const lastSelectedId = selectedKeyframeIds[selectedKeyframeIds.length - 1]
      const lastIndex = sortedKeyframes.findIndex((kf) => kf.id === lastSelectedId)
      const currentIndex = sortedKeyframes.findIndex((kf) => kf.id === id)
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = sortedKeyframes.slice(start, end + 1).map((kf) => kf.id)
        
        // Merge with existing selection
        const newSelection = [...new Set([...selectedKeyframeIds, ...rangeIds])]
        set({ selectedKeyframeIds: newSelection })
      }
    } else if (isCmd) {
      // Toggle individual selection
      if (selectedKeyframeIds.includes(id)) {
        set({ selectedKeyframeIds: selectedKeyframeIds.filter((kfId) => kfId !== id) })
      } else {
        set({ selectedKeyframeIds: [...selectedKeyframeIds, id] })
      }
    } else {
      // Single selection (replace)
      set({ selectedKeyframeIds: [id] })
    }
  },

  addOrUpdateKeyframe: (kf) => {
    const { project, past } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const easing = kf.easing ?? 'ease-in-out'
    const existing = project.keyframes.find(
      (k) => Math.abs(k.timestamp - kf.timestamp) < 0.1
    )

    let newKeyframes: Keyframe[]
    if (existing) {
      const updated = { ...existing, ...kf, easing, id: existing.id }
      if (kf.explicitScale !== undefined) {
        updated.explicitScale = kf.explicitScale
      }
      newKeyframes = project.keyframes.map((k) =>
        k.id === existing.id ? updated : k
      )
    } else {
      const newKf: Keyframe = { ...kf, easing, id: uuidv4() }
      if (kf.explicitScale !== undefined) {
        newKf.explicitScale = kf.explicitScale
      }
      newKeyframes = [
        ...project.keyframes,
        newKf,
      ]
    }

    set({
      project: {
        ...project,
        keyframes: sortKeyframes(newKeyframes),
      },
      past: newPast,
      future: [],
    })
  },

  updateKeyframe: (id, patch) => {
    const { project, past } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const newKeyframes = project.keyframes.map((k) =>
      k.id === id ? { ...k, ...patch } : k
    )

    // Only sort if timestamp changed
    const timestampChanged = patch.timestamp !== undefined
    const finalKeyframes = timestampChanged ? sortKeyframes(newKeyframes) : newKeyframes

    set({
      project: {
        ...project,
        keyframes: finalKeyframes,
      },
      past: newPast,
      future: [],
    })
  },

  deleteKeyframe: (id) => {
    const { project, past, selectedKeyframeIds } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const newKeyframes = project.keyframes.filter((k) => k.id !== id)

    set({
      project: {
        ...project,
        keyframes: newKeyframes,
      },
      past: newPast,
      future: [],
      selectedKeyframeIds: selectedKeyframeIds.filter((kfId) => kfId !== id),
    })
  },

  cloneKeyframeMinus: (id, offsetSeconds = 1.0) => {
    const { project, past } = get()
    if (!project) return

    // Find the keyframe we reference and the previous one
    const sorted = sortKeyframes(project.keyframes)
    const idx = sorted.findIndex((k) => k.id === id)
    if (idx === -1) return

    const prev = sorted[idx - 1]
    // If no previous, fall back to the current one (best effort)
    const source = prev ?? sorted[idx]

    let newTimestamp = sorted[idx].timestamp - offsetSeconds
    newTimestamp = Math.max(newTimestamp, project.trim.start, 0)

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const existing = project.keyframes.find(
      (k) => Math.abs(k.timestamp - newTimestamp) < 0.1
    )

    let newKeyframes: Keyframe[]
    if (existing) {
      newKeyframes = project.keyframes.map((k) =>
        k.id === existing.id
          ? { ...k, x: source.x, y: source.y, scale: source.scale, easing: source.easing }
          : k
      )
    } else {
      newKeyframes = [
        ...project.keyframes,
        {
          id: uuidv4(),
          timestamp: newTimestamp,
          x: source.x,
          y: source.y,
          scale: source.scale,
          explicitScale: source.explicitScale,
          easing: source.easing,
        },
      ]
    }

    set({
      project: {
        ...project,
        keyframes: sortKeyframes(newKeyframes),
      },
      past: newPast,
      future: [],
    })
  },

  setTrimStart: (t) => {
    const { project, past, currentTime } = get()
    if (!project) return

    const clamped = Math.max(0, Math.min(t, project.trim.end - 0.5))
    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const newKeyframes = project.keyframes.filter((k) => k.timestamp >= clamped)
    const newCurrentTime = currentTime < clamped ? clamped : currentTime

    set({
      project: {
        ...project,
        trim: { ...project.trim, start: clamped },
        keyframes: newKeyframes,
      },
      currentTime: newCurrentTime,
      past: newPast,
      future: [],
    })
    writeStoredPlayhead(project.id, newCurrentTime)
  },

  setTrimEnd: (t) => {
    const { project, past, currentTime } = get()
    if (!project) return

    const clamped = Math.max(project.trim.start + 0.5, Math.min(t, project.videoDuration))
    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const newKeyframes = project.keyframes.filter((k) => k.timestamp <= clamped)
    const newCurrentTime = currentTime > clamped ? clamped : currentTime

    set({
      project: {
        ...project,
        trim: { ...project.trim, end: clamped },
        keyframes: newKeyframes,
      },
      currentTime: newCurrentTime,
      past: newPast,
      future: [],
    })
    writeStoredPlayhead(project.id, newCurrentTime)
  },

  setOutputRatio: (ratio, width, height) => {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        outputRatio: ratio,
        outputWidth: width,
        outputHeight: height,
      },
    })
  },

  setStabilization: (enabled, smoothing = 10) => {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        stabilization: {
          enabled,
          smoothing,
        },
      },
    })
  },

  // Slice actions
  addSlice: (atTime) => {
    const { project, past } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const sliceDuration = 5
    // Default slice starts at the playhead
    let start = Math.max(project.trim.start, Math.min(atTime, project.trim.end))
    let end = Math.min(project.trim.end, start + sliceDuration)
    if (end <= start) {
      // If we're at the very end, keep a minimal positive duration
      start = Math.max(project.trim.start, project.trim.end - 0.1)
      end = project.trim.end
    }

    const newSlice: Slice = {
      id: uuidv4(),
      start,
      end,
      status: 'keep',
    }

    set({
      project: {
        ...project,
        slices: [...project.slices, newSlice].sort((a, b) => a.start - b.start),
      },
      selectedSliceId: newSlice.id,
      past: newPast,
      future: [],
    })
  },

  selectSlice: (id) => set({ selectedSliceId: id }),

  updateSlice: (id, patch) => {
    const { project, past } = get()
    if (!project) return

    // Capture snapshot before first update in a continuous operation
    if (!pendingSliceSnapshot) {
      pendingSliceSnapshot = {
        keyframes: deepCopyKeyframes(project.keyframes),
        trim: { ...project.trim },
        slices: deepCopySlices(project.slices),
      }
    }

    // Clear existing timer
    if (pendingSliceUndoTimer) {
      clearTimeout(pendingSliceUndoTimer)
    }

    // Update slice immediately
    const newSlices = project.slices.map((s) =>
      s.id === id ? { ...s, ...patch } : s
    ).sort((a, b) => a.start - b.start)

    set({
      project: { ...project, slices: newSlices },
      future: [],
    })

    // Push undo after 300ms of inactivity
    pendingSliceUndoTimer = setTimeout(() => {
      if (pendingSliceSnapshot) {
        const currentState = get()
        const newPast = [...currentState.past, pendingSliceSnapshot]
        if (newPast.length > 50) newPast.shift()
        set({ past: newPast })
        pendingSliceSnapshot = null
      }
      pendingSliceUndoTimer = null
    }, 300)
  },

  setSliceStatus: (id, status) => {
    const { project } = get()
    if (!project) return

    const newSlices = project.slices.map((s) =>
      s.id === id ? { ...s, status } : s
    )

    set({
      project: { ...project, slices: newSlices },
    })
  },

  deleteSlice: (id) => {
    const { project, past, selectedSliceId } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const newSlices = project.slices.filter((s) => s.id !== id)

    set({
      project: { ...project, slices: newSlices },
      past: newPast,
      future: [],
      selectedSliceId: selectedSliceId === id ? null : selectedSliceId,
    })
  },

  startBoxDraw: (sliceId) => {
    set({
      isPlaying: false,
      tracking: {
        ...get().tracking,
        drawingBox: true,
        sliceId,
      },
    })
  },

  cancelTracking: () => {
    set({
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
    })
  },

  beginTracking: (bbox, frameStart) => {
    set({
      tracking: {
        ...get().tracking,
        active: true,
        drawingBox: false,
        progress: 0,
        currentFrame: frameStart,
        totalFrames: 0,
        initialBbox: bbox,
      },
    })
  },

  updateTrackingProgress: (progress, currentFrame, totalFrames) => {
    set({
      tracking: {
        ...get().tracking,
        progress,
        currentFrame,
        totalFrames,
      },
    })
  },

  finishTracking: (results, untrackedRanges) => {
    set({
      tracking: {
        ...get().tracking,
        active: false,
        progress: 100,
        results,
        untrackedRanges,
      },
    })
  },

  applyTrackingAsKeyframes: (epsilon = 0.015) => {
    const { project, tracking, past, trackingSettings } = get()
    if (!project || tracking.results.length === 0) return

    const confidentResults = tracking.results.filter((r) => r.confident)
    if (confidentResults.length === 0) return

    const simplified = ramerDouglasPeucker(
      confidentResults.map((r) => ({ t: r.t, x: r.x, y: r.y })),
      epsilon
    )

    // Filter by minimum duration
    const filtered: typeof simplified = []
    let lastTimestamp = -Infinity
    for (const point of simplified) {
      if (point.t - lastTimestamp >= trackingSettings.minDuration) {
        filtered.push(point)
        lastTimestamp = point.t
      }
    }

    if (filtered.length === 0) return

    // Compute scale so the crop is 1.5x the tracking bbox
    // cropFrac = 1/scale, so scale = 1/cropFrac
    // We want the crop to be 1.5× the bbox in both dimensions,
    // then pick the dimension that requires more zoom (larger scale)
    const PADDING = 1.5
    let scale = 1.0
    if (tracking.initialBbox) {
      const bboxFracW = tracking.initialBbox.w / project.videoWidth
      const bboxFracH = tracking.initialBbox.h / project.videoHeight
      const cropFracW = bboxFracW * PADDING
      const cropFracH = bboxFracH * PADDING

      // The output aspect ratio determines which dimension constrains the crop
      const vidAspect = project.videoWidth / project.videoHeight
      const outAspect = project.outputWidth / project.outputHeight

      let scaleFromW: number
      let scaleFromH: number
      if (outAspect < vidAspect) {
        // Portrait output: height is the primary axis
        scaleFromH = 1 / cropFracH
        scaleFromW = 1 / (cropFracW * (vidAspect / outAspect))
      } else {
        // Landscape output: width is the primary axis
        scaleFromW = 1 / cropFracW
        scaleFromH = 1 / (cropFracH * (outAspect / vidAspect))
      }

      // Use the smaller scale so the full 1.5x bbox fits in the crop
      scale = Math.max(1, Math.min(scaleFromW, scaleFromH))
    }

    // Auto easing: select based on time gap between keyframes
    const determineEasing = (index: number): EasingType => {
      if (trackingSettings.defaultEasing !== 'auto') {
        return trackingSettings.defaultEasing
      }
      
      // For auto mode, use easing based on spacing
      const prevGap = index > 0 ? filtered[index].t - filtered[index - 1].t : 0
      const nextGap = index < filtered.length - 1 ? filtered[index + 1].t - filtered[index].t : 0
      
      // Short gaps (< 2s): use ease-in-out for smooth motion
      // Medium gaps (2-4s): use linear for predictable motion
      // Long gaps (> 4s): use ease-in-out for natural acceleration/deceleration
      const avgGap = (prevGap + nextGap) / 2
      
      if (avgGap < 2) {
        return 'ease-in-out'
      } else if (avgGap < 4) {
        return 'linear'
      } else {
        return 'ease-in-out'
      }
    }

    const newKeyframes: Keyframe[] = filtered.map((p, i) => ({
      id: uuidv4(),
      timestamp: p.t,
      x: p.x,
      y: p.y,
      scale,
      explicitScale: true,
      easing: determineEasing(i),
    }))

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)

    set({
      project: {
        ...project,
        keyframes: sortKeyframes([...project.keyframes, ...newKeyframes]),
      },
      past: newPast,
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
    })
  },

  retrackFromFrame: (frameIndex) => {
    set({
      tracking: {
        ...get().tracking,
        drawingBox: true,
        active: false,
        results: [],
        untrackedRanges: [],
      },
    })
  },

  setTrackingSettings: (settings) => {
    set({ trackingSettings: settings })
  },

  closeProject: () => {
    set({
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
    })
  },

  undo: () => {
    const { project, past, future } = get()
    if (!project || past.length === 0) return

    const newPast = [...past]
    const snapshot = newPast.pop()!

    const currentSnapshot: UndoSnapshot = {
      keyframes: deepCopyKeyframes(project.keyframes),
      trim: { ...project.trim },
      slices: deepCopySlices(project.slices),
    }

    set({
      project: {
        ...project,
        keyframes: snapshot.keyframes,
        trim: snapshot.trim,
        slices: snapshot.slices,
      },
      past: newPast,
      future: [...future, currentSnapshot],
    })
  },

  redo: () => {
    const { project, past, future } = get()
    if (!project || future.length === 0) return

    const newFuture = [...future]
    const snapshot = newFuture.pop()!

    const currentSnapshot: UndoSnapshot = {
      keyframes: deepCopyKeyframes(project.keyframes),
      trim: { ...project.trim },
      slices: deepCopySlices(project.slices),
    }

    set({
      project: {
        ...project,
        keyframes: snapshot.keyframes,
        trim: snapshot.trim,
        slices: snapshot.slices,
      },
      past: [...past, currentSnapshot],
      future: newFuture,
    })
  },
}))
