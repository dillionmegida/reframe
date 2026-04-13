import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../src/store/appStore'
import type { VideoEntry, AppData } from '../src/types'

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

// Mock window.electron and localStorage
Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: localStorageMock,
    electron: {
      loadAppData: vi.fn(),
      saveAppData: vi.fn().mockResolvedValue(undefined),
    },
  },
  writable: true,
})

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

function makeVideoData(): Omit<VideoEntry, 'id' | 'projectId' | 'addedAt'> {
  return {
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
  }
}

describe('appStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    useAppStore.setState({
      loaded: false,
      basePath: null,
      projects: [],
      videos: [],
      route: { view: 'projects' },
    })
  })

  describe('init', () => {
    it('loads app data from electron and sets loaded', async () => {
      const mockData: AppData = {
        basePath: '/test/path',
        projects: [{ id: 'p1', name: 'Test', createdAt: 1000 }],
        videos: [],
      }
      ;(window.electron.loadAppData as any).mockResolvedValue(mockData)

      await useAppStore.getState().init()

      const state = useAppStore.getState()
      expect(state.loaded).toBe(true)
      expect(state.basePath).toBe('/test/path')
      expect(state.projects.length).toBe(1)
      expect(state.projects[0].name).toBe('Test')
    })

    it('sets loaded even if electron call fails', async () => {
      ;(window.electron.loadAppData as any).mockRejectedValue(new Error('fail'))

      await useAppStore.getState().init()

      expect(useAppStore.getState().loaded).toBe(true)
    })

    it('restores stored route on init', async () => {
      localStorageMock.setItem(
        'reframe.route',
        JSON.stringify({ view: 'project', projectId: 'p1' })
      )
      ;(window.electron.loadAppData as any).mockResolvedValue({
        basePath: null,
        projects: [],
        videos: [],
      })

      await useAppStore.getState().init()

      const route = useAppStore.getState().route
      expect(route.view).toBe('project')
      expect((route as any).projectId).toBe('p1')
    })

    it('defaults to projects view when stored route is invalid', async () => {
      localStorageMock.setItem('reframe.route', '{invalid json')
      ;(window.electron.loadAppData as any).mockResolvedValue({
        basePath: null,
        projects: [],
        videos: [],
      })

      await useAppStore.getState().init()
      expect(useAppStore.getState().route.view).toBe('projects')
    })

    it('ignores stored route with missing fields', async () => {
      localStorageMock.setItem(
        'reframe.route',
        JSON.stringify({ view: 'editor', projectId: 'p1' }) // missing videoId
      )
      ;(window.electron.loadAppData as any).mockResolvedValue({
        basePath: null,
        projects: [],
        videos: [],
      })

      await useAppStore.getState().init()
      expect(useAppStore.getState().route.view).toBe('projects')
    })
  })

  describe('setBasePath', () => {
    it('sets base path and persists', () => {
      useAppStore.getState().setBasePath('/new/path')

      expect(useAppStore.getState().basePath).toBe('/new/path')
      expect(window.electron.saveAppData).toHaveBeenCalled()
    })
  })

  describe('navigation', () => {
    it('navigate updates route and stores it', () => {
      useAppStore.getState().navigate({ view: 'project', projectId: 'p1' })

      expect(useAppStore.getState().route).toEqual({ view: 'project', projectId: 'p1' })
      const stored = JSON.parse(localStorageMock.getItem('reframe.route')!)
      expect(stored.view).toBe('project')
      expect(stored.projectId).toBe('p1')
    })

    it('navigate to editor stores full route', () => {
      useAppStore.getState().navigate({ view: 'editor', projectId: 'p1', videoId: 'v1' })

      const stored = JSON.parse(localStorageMock.getItem('reframe.route')!)
      expect(stored.view).toBe('editor')
      expect(stored.projectId).toBe('p1')
      expect(stored.videoId).toBe('v1')
    })
  })

  describe('project CRUD', () => {
    it('createProject adds project and navigates to it', () => {
      const id = useAppStore.getState().createProject('My Project')

      const state = useAppStore.getState()
      expect(state.projects.length).toBe(1)
      expect(state.projects[0].name).toBe('My Project')
      expect(state.projects[0].id).toBe(id)
      expect(state.route).toEqual({ view: 'project', projectId: id })
      expect(window.electron.saveAppData).toHaveBeenCalled()
    })

    it('createProject generates unique ids', () => {
      const id1 = useAppStore.getState().createProject('Project 1')
      const id2 = useAppStore.getState().createProject('Project 2')

      expect(id1).not.toBe(id2)
      expect(useAppStore.getState().projects.length).toBe(2)
    })

    it('renameProject updates project name', () => {
      const id = useAppStore.getState().createProject('Old Name')
      useAppStore.getState().renameProject(id, 'New Name')

      expect(useAppStore.getState().projects[0].name).toBe('New Name')
      expect(window.electron.saveAppData).toHaveBeenCalled()
    })

    it('renameProject ignores non-existent id', () => {
      useAppStore.getState().createProject('Name')
      useAppStore.getState().renameProject('nonexistent', 'New')

      expect(useAppStore.getState().projects[0].name).toBe('Name')
    })

    it('deleteProject removes project and its videos', () => {
      const pid = useAppStore.getState().createProject('Test')
      useAppStore.getState().addVideo(pid, makeVideoData())

      expect(useAppStore.getState().videos.length).toBe(1)

      useAppStore.getState().deleteProject(pid)

      expect(useAppStore.getState().projects.length).toBe(0)
      expect(useAppStore.getState().videos.length).toBe(0)
    })

    it('deleteProject navigates to projects list when deleting active project', () => {
      const pid = useAppStore.getState().createProject('Test')
      // createProject already navigates to the project view
      expect(useAppStore.getState().route).toEqual({ view: 'project', projectId: pid })

      useAppStore.getState().deleteProject(pid)

      expect(useAppStore.getState().route).toEqual({ view: 'projects' })
    })

    it('deleteProject preserves route when deleting non-active project', () => {
      const pid1 = useAppStore.getState().createProject('Project 1')
      const pid2 = useAppStore.getState().createProject('Project 2')
      // Route is at project 2 after creating it

      useAppStore.getState().deleteProject(pid1)

      expect(useAppStore.getState().route).toEqual({ view: 'project', projectId: pid2 })
      expect(useAppStore.getState().projects.length).toBe(1)
    })

    it('getProject returns project by id', () => {
      const id = useAppStore.getState().createProject('Test')

      expect(useAppStore.getState().getProject(id)?.name).toBe('Test')
      expect(useAppStore.getState().getProject('nonexistent')).toBeUndefined()
    })
  })

  describe('video CRUD', () => {
    let projectId: string

    beforeEach(() => {
      projectId = useAppStore.getState().createProject('Test Project')
    })

    it('addVideo creates video with generated id', () => {
      const vid = useAppStore.getState().addVideo(projectId, makeVideoData())

      const state = useAppStore.getState()
      expect(state.videos.length).toBe(1)
      expect(state.videos[0].id).toBe(vid)
      expect(state.videos[0].projectId).toBe(projectId)
      expect(state.videos[0].videoPath).toBe('/test/video.mp4')
      expect(state.videos[0].addedAt).toBeGreaterThan(0)
      expect(window.electron.saveAppData).toHaveBeenCalled()
    })

    it('addVideo generates unique ids', () => {
      const id1 = useAppStore.getState().addVideo(projectId, makeVideoData())
      const id2 = useAppStore.getState().addVideo(projectId, makeVideoData())

      expect(id1).not.toBe(id2)
      expect(useAppStore.getState().videos.length).toBe(2)
    })

    it('updateVideo patches video fields', () => {
      const vid = useAppStore.getState().addVideo(projectId, makeVideoData())
      useAppStore.getState().updateVideo(vid, { outputRatio: '1:1', outputWidth: 1080, outputHeight: 1080 })

      const video = useAppStore.getState().getVideo(vid)
      expect(video?.outputRatio).toBe('1:1')
      expect(video?.outputHeight).toBe(1080)
      expect(video?.videoPath).toBe('/test/video.mp4') // unchanged
    })

    it('removeVideo deletes the video', () => {
      const vid = useAppStore.getState().addVideo(projectId, makeVideoData())
      useAppStore.getState().removeVideo(vid)

      expect(useAppStore.getState().videos.length).toBe(0)
    })

    it('removeVideo navigates away from editor when removing active video', () => {
      const vid = useAppStore.getState().addVideo(projectId, makeVideoData())
      useAppStore.getState().navigate({ view: 'editor', projectId, videoId: vid })

      useAppStore.getState().removeVideo(vid)

      const route = useAppStore.getState().route
      expect(route.view).toBe('project')
      expect((route as any).projectId).toBe(projectId)
    })

    it('removeVideo preserves route when removing non-active video', () => {
      const vid1 = useAppStore.getState().addVideo(projectId, makeVideoData())
      const vid2 = useAppStore.getState().addVideo(projectId, makeVideoData())
      useAppStore.getState().navigate({ view: 'editor', projectId, videoId: vid1 })

      useAppStore.getState().removeVideo(vid2)

      expect(useAppStore.getState().route).toEqual({ view: 'editor', projectId, videoId: vid1 })
    })

    it('getVideo returns undefined for non-existent id', () => {
      expect(useAppStore.getState().getVideo('nonexistent')).toBeUndefined()
    })

    it('getProjectVideos returns only videos for that project', () => {
      const pid2 = useAppStore.getState().createProject('Other')
      useAppStore.getState().addVideo(projectId, makeVideoData())
      useAppStore.getState().addVideo(projectId, makeVideoData())
      useAppStore.getState().addVideo(pid2, makeVideoData())

      expect(useAppStore.getState().getProjectVideos(projectId).length).toBe(2)
      expect(useAppStore.getState().getProjectVideos(pid2).length).toBe(1)
      expect(useAppStore.getState().getProjectVideos('nonexistent').length).toBe(0)
    })
  })

  describe('persist', () => {
    it('calls saveAppData with current state', () => {
      useAppStore.getState().createProject('Test')
      vi.clearAllMocks()

      useAppStore.getState().persist()

      expect(window.electron.saveAppData).toHaveBeenCalledWith(
        expect.objectContaining({
          projects: expect.arrayContaining([
            expect.objectContaining({ name: 'Test' }),
          ]),
        })
      )
    })
  })
})
