import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useEditorStore } from './store/editorStore'
import Sidebar from './components/Sidebar'
import ProjectDetail from './screens/ProjectDetail'
import EditorScreen from './screens/EditorScreen'

export default function App() {
  const loaded = useAppStore((s) => s.loaded)
  const route = useAppStore((s) => s.route)
  const init = useAppStore((s) => s.init)
  const editorProject = useEditorStore((s) => s.project)
  const loadEditorProject = useEditorStore((s) => s.loadProject)
  const getVideo = useAppStore((s) => s.getVideo)

  useEffect(() => {
    init()
  }, [init])

  // Load video into editor when route is restored from URL hash
  useEffect(() => {
    if (!loaded) return
    if (route.view === 'editor' && !editorProject) {
      const video = getVideo(route.videoId)
      if (video) {
        loadEditorProject(video)
      }
    }
  }, [loaded, route, editorProject, getVideo, loadEditorProject])

  if (!loaded) {
    return (
      <div className="w-full h-full bg-bg flex items-center justify-center">
        <span className="text-text-muted text-sm">Loading...</span>
      </div>
    )
  }

  // Editor view is full-width (no sidebar) for maximum workspace
  if (route.view === 'editor' && editorProject) {
    return (
      <div className="w-full h-full bg-bg">
        <EditorScreen />
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-bg flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        {route.view === 'project' ? (
          <ProjectDetail projectId={route.projectId} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="w-full h-full flex flex-col">
      {/* Drag region header */}
      <div
        className="h-12 flex items-center px-4 border-b border-border panel-bg flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <span className="text-sm font-semibold tracking-[0.2em] text-text-primary select-none">
          REFRAME
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-medium text-text-primary mb-2">Welcome to Reframe</h1>
          <p className="text-sm text-text-muted">
            Select a project from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>
    </div>
  )
}
