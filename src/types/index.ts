export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface Keyframe {
  id: string
  timestamp: number
  x: number
  y: number
  scale: number
  easing: EasingType
}

export type AspectRatio = '9:16' | '4:5' | '1:1' | 'custom'

export interface TrimRange {
  start: number
  end: number
}

export type SliceStatus = 'keep' | 'hidden'

export interface Slice {
  id: string
  start: number
  end: number
  status: SliceStatus
}

export interface ReframeProject {
  id: string
  name: string
  createdAt: number
}

export interface VideoEntry {
  id: string
  projectId: string
  videoPath: string
  videoDuration: number
  videoWidth: number
  videoHeight: number
  videoFps: number
  outputRatio: AspectRatio
  outputWidth: number
  outputHeight: number
  trim: TrimRange
  keyframes: Keyframe[]
  slices: Slice[]
  addedAt: number
}

export interface AppData {
  basePath: string | null
  projects: ReframeProject[]
  videos: VideoEntry[]
}

// Legacy alias — used by editorStore internally
export type Project = VideoEntry
