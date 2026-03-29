import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Keyframe, VideoEntry, TrimRange } from '../types'

type Project = VideoEntry

interface UndoSnapshot {
  keyframes: Keyframe[]
  trim: TrimRange
}

interface EditorState {
  project: Project | null
  currentTime: number
  isPlaying: boolean
  selectedKeyframeId: string | null
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

function pushUndo(past: UndoSnapshot[], keyframes: Keyframe[], trim: TrimRange): UndoSnapshot[] {
  const snapshot: UndoSnapshot = {
    keyframes: deepCopyKeyframes(keyframes),
    trim: { ...trim },
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
  past: [],
  future: [],

  loadProject: (project) => {
    set({
      project,
      currentTime: project.trim.start,
      isPlaying: false,
      selectedKeyframeId: null,
      past: [],
      future: [],
    })
  },

  setCurrentTime: (t) => {
    const { project } = get()
    if (!project) return
    const clamped = Math.max(project.trim.start, Math.min(project.trim.end, t))
    set({ currentTime: clamped })
  },

  setPlaying: (v) => set({ isPlaying: v }),

  selectKeyframe: (id) => set({ selectedKeyframeId: id }),

  addOrUpdateKeyframe: (kf) => {
    const { project, past } = get()
    if (!project) return

    const newPast = pushUndo(past, project.keyframes, project.trim)
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

    const newPast = pushUndo(past, project.keyframes, project.trim)
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

    const newPast = pushUndo(past, project.keyframes, project.trim)
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

    const newPast = pushUndo(past, project.keyframes, project.trim)
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
    const newPast = pushUndo(past, project.keyframes, project.trim)
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
  },

  setTrimEnd: (t) => {
    const { project, past, currentTime } = get()
    if (!project) return

    const clamped = Math.max(project.trim.start + 0.5, Math.min(t, project.videoDuration))
    const newPast = pushUndo(past, project.keyframes, project.trim)
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

  closeProject: () => {
    set({
      project: null,
      currentTime: 0,
      isPlaying: false,
      selectedKeyframeId: null,
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
    }

    set({
      project: {
        ...project,
        keyframes: snapshot.keyframes,
        trim: snapshot.trim,
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
    }

    set({
      project: {
        ...project,
        keyframes: snapshot.keyframes,
        trim: snapshot.trim,
      },
      past: [...past, currentSnapshot],
      future: newFuture,
    })
  },
}))
