import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Keyframe, VideoEntry, TrimRange, Slice, SliceStatus } from '../types'

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
  selectedKeyframeId: string | null
  selectedSliceId: string | null
  past: UndoSnapshot[]
  future: UndoSnapshot[]

  loadProject: (project: Project) => void
  setCurrentTime: (t: number) => void
  setPlaying: (v: boolean) => void
  selectKeyframe: (id: string | null) => void

  addOrUpdateKeyframe: (kf: Omit<Keyframe, 'id'>) => void
  updateKeyframe: (id: string, patch: Partial<Keyframe>) => void
  deleteKeyframe: (id: string) => void
  cloneKeyframeMinus: (id: string, offsetSeconds?: number) => void

  setTrimStart: (t: number) => void
  setTrimEnd: (t: number) => void

  setOutputRatio: (ratio: Project['outputRatio'], width: number, height: number) => void

  // Slice actions
  addSlice: (atTime: number) => void
  selectSlice: (id: string | null) => void
  updateSlice: (id: string, patch: Partial<Slice>) => void
  setSliceStatus: (id: string, status: SliceStatus) => void
  deleteSlice: (id: string) => void

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
  selectedKeyframeId: null,
  selectedSliceId: null,
  past: [],
  future: [],

  loadProject: (project) => {
    // Ensure slices array exists for legacy data
    const p = { ...project, slices: project.slices || [] }
    const storedPlayhead = readStoredPlayhead(p.id, p.trim.start, p.trim.end)
    set({
      project: p,
      currentTime: storedPlayhead,
      isPlaying: false,
      selectedKeyframeId: null,
      selectedSliceId: null,
      past: [],
      future: [],
    })
  },

  setCurrentTime: (t) => {
    const { project } = get()
    if (!project) return
    const clamped = Math.max(project.trim.start, Math.min(project.trim.end, t))
    writeStoredPlayhead(project.id, clamped)
    set({ currentTime: clamped })
  },

  setPlaying: (v) => set({ isPlaying: v }),

  selectKeyframe: (id) => set({ selectedKeyframeId: id }),

  addOrUpdateKeyframe: (kf) => {
    const { project, past } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const easing = kf.easing ?? 'ease-in'
    const existing = project.keyframes.find(
      (k) => Math.abs(k.timestamp - kf.timestamp) < 0.1
    )

    let newKeyframes: Keyframe[]
    if (existing) {
      newKeyframes = project.keyframes.map((k) =>
        k.id === existing.id
          ? { ...k, ...kf, easing, id: k.id }
          : k
      )
    } else {
      newKeyframes = [
        ...project.keyframes,
        { ...kf, easing, id: uuidv4() },
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

    set({
      project: {
        ...project,
        keyframes: sortKeyframes(newKeyframes),
      },
      past: newPast,
      future: [],
    })
  },

  deleteKeyframe: (id) => {
    const { project, past, selectedKeyframeId } = get()
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
      selectedKeyframeId: selectedKeyframeId === id ? null : selectedKeyframeId,
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

    const newPast = pushUndo(past, project.keyframes, project.trim, project.slices)
    const newSlices = project.slices.map((s) =>
      s.id === id ? { ...s, ...patch } : s
    ).sort((a, b) => a.start - b.start)

    set({
      project: { ...project, slices: newSlices },
      past: newPast,
      future: [],
    })
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

  closeProject: () => {
    set({
      project: null,
      currentTime: 0,
      isPlaying: false,
      selectedKeyframeId: null,
      selectedSliceId: null,
      past: [],
      future: [],
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
