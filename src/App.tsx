import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useAppStore } from './store/appStore'
import { useEditorStore } from './store/editorStore'
import Sidebar from './components/Sidebar'
import ProjectDetail from './screens/ProjectDetail'
import EditorScreen from './screens/EditorScreen'
import BasePathSetup from './screens/BasePathSetup'

const LoadingContainer = styled.div`
  width: 100%;
  height: 100%;
  background: #0e0e0e;
  display: flex;
  align-items: center;
  justify-content: center;
`

const LoadingText = styled.span`
  color: #6b7280;
  font-size: 0.875rem;
`

const AppContainer = styled.div`
  width: 100%;
  height: 100%;
  background: #0e0e0e;
`

const MainLayout = styled.div`
  width: 100%;
  height: 100%;
  background: #0e0e0e;
  display: flex;
`

const MainContent = styled.div`
  flex: 1;
  min-width: 0;
`

const WelcomeContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
`

const WelcomeHeader = styled.div`
  height: 3rem;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid #2a2a2a;
  background-color: #161616;
  position: relative;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/noise.svg');
    background-repeat: repeat;
    opacity: 0.4;
    pointer-events: none;
  }
`

const WelcomeTitle = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: #e5e5e5;
  user-select: none;
  position: relative;
  z-index: 1;
`

const WelcomeBody = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`

const WelcomeContent = styled.div`
  text-align: center;
`

const WelcomeHeading = styled.h1`
  font-size: 1.125rem;
  font-weight: 500;
  color: #e5e5e5;
  margin-bottom: 0.5rem;
`

const WelcomeText = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
`

export default function App() {
  const loaded = useAppStore((s) => s.loaded)
  const basePath = useAppStore((s) => s.basePath)
  const route = useAppStore((s) => s.route)
  const init = useAppStore((s) => s.init)
  const editorProject = useEditorStore((s) => s.project)
  const loadEditorProject = useEditorStore((s) => s.loadProject)
  const getVideo = useAppStore((s) => s.getVideo)

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('reframe.sidebarWidth')
    return saved ? parseInt(saved, 10) : 200
  })

  useEffect(() => {
    init()
  }, [init])

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
      <LoadingContainer>
        <LoadingText>Loading...</LoadingText>
      </LoadingContainer>
    )
  }

  if (!basePath) {
    return <BasePathSetup />
  }

  if (route.view === 'editor' && editorProject) {
    return (
      <AppContainer>
        <EditorScreen />
      </AppContainer>
    )
  }

  return (
    <MainLayout>
      <Sidebar width={sidebarWidth} onWidthChange={setSidebarWidth} />
      <MainContent>
        {route.view === 'project' ? (
          <ProjectDetail projectId={route.projectId} />
        ) : (
          <WelcomeScreen />
        )}
      </MainContent>
    </MainLayout>
  )
}

function WelcomeScreen() {
  return (
    <WelcomeContainer>
      <WelcomeHeader style={{ WebkitAppRegion: 'drag' } as any}>
        <WelcomeTitle>REFRAME</WelcomeTitle>
      </WelcomeHeader>
      <WelcomeBody>
        <WelcomeContent>
          <WelcomeHeading>Welcome to Reframe</WelcomeHeading>
          <WelcomeText>
            Select a project from the sidebar or create a new one to get started.
          </WelcomeText>
        </WelcomeContent>
      </WelcomeBody>
    </WelcomeContainer>
  )
}
