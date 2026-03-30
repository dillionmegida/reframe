import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { ReframeProject, VideoEntry, AppData } from '../types'

type Route =
  | { view: 'projects' }
  | { view: 'project'; projectId: string }
  | { view: 'editor'; projectId: string; videoId: string }

// Parse URL hash to route format: #/project/:projectId or #/project/:projectId/:videoId
function parseHashRoute(hash: string): Route | null {
  const match = hash.match(/^#\/project\/([^/]+)(?:\/([^/]+))?$/)
  if (!match) return null
  const [, projectId, videoId] = match
  if (videoId) {
    return { view: 'editor', projectId, videoId }
  }
  return { view: 'project', projectId }
}

// Update URL hash based on route
function updateHashRoute(route: Route): void {
  if (route.view === 'projects') {
    window.location.hash = ''
  } else if (route.view === 'project') {
    window.location.hash = `#/project/${route.projectId}`
  } else if (route.view === 'editor') {
    window.location.hash = `#/project/${route.projectId}/${route.videoId}`
  }
}

interface AppState {
  loaded: boolean
  basePath: string | null
  projects: ReframeProject[]
  videos: VideoEntry[]
  route: Route

  // Init
  init: () => Promise<void>
  persist: () => void

  // Base path
  setBasePath: (path: string) => void

  // Navigation
  navigate: (route: Route) => void

  // Projects CRUD
  createProject: (name: string) => string
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void

  // Videos CRUD
  addVideo: (projectId: string, video: Omit<VideoEntry, 'id' | 'projectId' | 'addedAt'>) => string
  updateVideo: (id: string, patch: Partial<VideoEntry>) => void
  removeVideo: (id: string) => void
  getVideo: (id: string) => VideoEntry | undefined
  getProjectVideos: (projectId: string) => VideoEntry[]
  getProject: (id: string) => ReframeProject | undefined
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  basePath: null,
  projects: [],
  videos: [],
  route: { view: 'projects' },

  init: async () => {
    try {
      const data: AppData = await window.electron.loadAppData()
      // Parse URL hash to restore route
      const hashRoute = parseHashRoute(window.location.hash)
      set({
        basePath: data.basePath || null,
        projects: data.projects || [],
        videos: data.videos || [],
        loaded: true,
        route: hashRoute || { view: 'projects' },
      })
    } catch {
      const hashRoute = parseHashRoute(window.location.hash)
      set({ loaded: true, route: hashRoute || { view: 'projects' } })
    }
  },

  persist: () => {
    const { basePath, projects, videos } = get()
    const data: AppData = { basePath, projects, videos }
    window.electron.saveAppData(data).catch(() => {})
  },

  setBasePath: (path) => {
    set({ basePath: path })
    get().persist()
  },

  navigate: (route) => {
    set({ route })
    // Update URL hash to persist route
    updateHashRoute(route)
  },

  createProject: (name) => {
    const id = uuidv4()
    const project: ReframeProject = { id, name, createdAt: Date.now() }
    const route = { view: 'project' as const, projectId: id }
    set((s) => ({
      projects: [...s.projects, project],
      route,
    }))
    updateHashRoute(route)
    get().persist()
    return id
  },

  renameProject: (id, name) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
    }))
    get().persist()
  },

  deleteProject: (id) => {
    const state = get()
    const newRoute = state.route.view !== 'projects' && 'projectId' in state.route && state.route.projectId === id
      ? { view: 'projects' as const }
      : state.route
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      videos: s.videos.filter((v) => v.projectId !== id),
      route: newRoute,
    }))
    updateHashRoute(newRoute)
    get().persist()
  },

  addVideo: (projectId, videoData) => {
    const id = uuidv4()
    const video: VideoEntry = {
      ...videoData,
      id,
      projectId,
      addedAt: Date.now(),
    }
    set((s) => ({ videos: [...s.videos, video] }))
    get().persist()
    return id
  },

  updateVideo: (id, patch) => {
    set((s) => ({
      videos: s.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }))
    get().persist()
  },

  removeVideo: (id) => {
    const state = get()
    const newRoute = state.route.view === 'editor' && state.route.videoId === id
      ? { view: 'project' as const, projectId: (state.route as any).projectId }
      : state.route
    set((s) => ({
      videos: s.videos.filter((v) => v.id !== id),
      route: newRoute,
    }))
    updateHashRoute(newRoute)
    get().persist()
  },

  getVideo: (id) => get().videos.find((v) => v.id === id),
  getProjectVideos: (projectId) => get().videos.filter((v) => v.projectId === projectId),
  getProject: (id) => get().projects.find((p) => p.id === id),
}))
