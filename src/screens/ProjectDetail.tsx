import { useState, useCallback, useMemo, DragEvent } from 'react'
import styled from 'styled-components'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore } from '../store/appStore'
import { useEditorStore } from '../store/editorStore'

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const Header = styled.div`
  height: 3rem;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
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

  > * {
    position: relative;
    z-index: 1;
  }
`

const ProjectName = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: #e5e5e5;
`

const VideoCount = styled.span`
  font-size: 0.75rem;
  color: #6b7280;
`

const Spacer = styled.div`
  flex: 1;
`

const AddButton = styled.button<{ $disabled: boolean }>`
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.25rem;
  background: #f97316;
  color: #000;
  border: none;
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(p) => (p.$disabled ? 0.5 : 1)};
  transition: background-color 0.2s;

  &:hover {
    background: ${(p) => (p.$disabled ? '#f97316' : 'rgba(249, 115, 22, 0.9)')};
  }
`

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`

const ErrorBox = styled.div`
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
  font-size: 0.75rem;
`

const DropZone = styled.div<{ $isDragging: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 0;
  border-radius: 0.75rem;
  border: 2px dashed ${(p) => (p.$isDragging ? '#f97316' : '#2a2a2a')};
  background: ${(p) => (p.$isDragging ? 'rgba(249, 115, 22, 0.05)' : 'transparent')};
  transition: all 0.2s;
`

const DropZoneText = styled.div`
  text-align: center;
`

const DropZoneTitle = styled.p`
  font-size: 0.875rem;
  color: #e5e5e5;
`

const DropZoneSubtitle = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
`

const VideoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
`

const VideoButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &:hover span:last-child {
    opacity: 1;
  }
`

const VideoIcon = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`

const VideoInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const VideoName = styled.div`
  font-size: 0.875rem;
  color: #e5e5e5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const VideoMeta = styled.div`
  font-size: 0.6875rem;
  color: #6b7280;
`

const EditLabel = styled.span`
  font-size: 0.6875rem;
  color: #6b7280;
  opacity: 0;
  transition: opacity 0.2s;
`

const ContextMenuBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
`

const ContextMenu = styled.div`
  position: fixed;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  padding: 0.25rem 0;
  z-index: 50;
  min-width: 120px;
`

const ContextMenuItem = styled.button`
  width: 100%;
  text-align: left;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  color: #f87171;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const projects = useAppStore((s) => s.projects)
  const allVideos = useAppStore((s) => s.videos)
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])
  const videos = useMemo(
    () => allVideos.filter((v) => v.projectId === projectId),
    [allVideos, projectId]
  )
  const addVideo = useAppStore((s) => s.addVideo)
  const removeVideo = useAppStore((s) => s.removeVideo)
  const navigate = useAppStore((s) => s.navigate)
  const loadEditorProject = useEditorStore((s) => s.loadProject)

  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; videoId: string } | null>(null)

  const processFile = useCallback(
    async (filePath: string) => {
      setLoading(true)
      setError(null)
      try {
        const meta = await window.electron.getVideoMetadata(filePath)
        const videoId = addVideo(projectId, {
          videoPath: filePath,
          videoDuration: meta.duration,
          videoWidth: meta.width,
          videoHeight: meta.height,
          outputRatio: '9:16',
          outputWidth: 1080,
          outputHeight: 1920,
          trim: { start: 0, end: meta.duration },
          keyframes: [
            {
              id: uuidv4(),
              timestamp: 0,
              x: 0.5,
              y: 0.5,
              scale: 1.0,
              easing: 'linear',
            },
          ],
          slices: [],
        })
        const video = useAppStore.getState().getVideo(videoId)
        if (video) {
          loadEditorProject(video)
          navigate({ view: 'editor', projectId, videoId })
        }
      } catch (e: any) {
        setError(e.message || 'Failed to read video metadata')
      } finally {
        setLoading(false)
      }
    },
    [projectId, addVideo, navigate, loadEditorProject]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const files = e.dataTransfer.files
      if (files.length > 0) {
        try {
          const filePath = window.electron.getPathForFile(files[0])
          if (filePath) {
            processFile(filePath)
            return
          }
        } catch {
          /* fallback */
        }
        const file = files[0] as File & { path?: string }
        if (file.path) {
          processFile(file.path)
          return
        }
        setError('Could not read file path. Please use the button.')
      }
    },
    [processFile]
  )

  const handleOpenFile = useCallback(async () => {
    const filePath = await window.electron.openFile()
    if (filePath) processFile(filePath)
  }, [processFile])

  const handleOpenVideo = useCallback(
    (videoId: string) => {
      const video = useAppStore.getState().getVideo(videoId)
      if (video) {
        loadEditorProject(video)
        navigate({ view: 'editor', projectId, videoId })
      }
    },
    [projectId, navigate, loadEditorProject]
  )

  if (!project) return null

  const sorted = [...videos].sort((a, b) => b.addedAt - a.addedAt)

  return (
    <Container onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <Header style={{ WebkitAppRegion: 'drag' } as any}>
        <ProjectName style={{ WebkitAppRegion: 'no-drag' } as any}>{project.name}</ProjectName>
        <VideoCount>
          {videos.length} video{videos.length !== 1 ? 's' : ''}
        </VideoCount>
        <Spacer />
        <AddButton
          onClick={handleOpenFile}
          disabled={loading}
          $disabled={loading}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {loading ? 'Reading...' : '+ Add Video'}
        </AddButton>
      </Header>

      <Content>
        {error && <ErrorBox>{error}</ErrorBox>}

        {sorted.length === 0 ? (
          <DropZone $isDragging={isDragging}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke={isDragging ? '#f97316' : '#6b7280'}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <DropZoneText>
              <DropZoneTitle>Drop a video or click "Add Video"</DropZoneTitle>
              <DropZoneSubtitle>MP4, MOV, AVI, MKV, WebM</DropZoneSubtitle>
            </DropZoneText>
          </DropZone>
        ) : (
          <VideoGrid>
            {sorted.map((v) => {
              const fileName = v.videoPath.split('/').pop() || v.videoPath
              return (
                <VideoButton
                  key={v.id}
                  onClick={() => handleOpenVideo(v.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, videoId: v.id })
                  }}
                >
                  <VideoIcon>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </VideoIcon>
                  <VideoInfo>
                    <VideoName>{fileName}</VideoName>
                    <VideoMeta>
                      {v.videoWidth}x{v.videoHeight} &middot; {Math.round(v.videoDuration)}s &middot; {v.outputRatio}
                    </VideoMeta>
                  </VideoInfo>
                  <EditLabel>Edit</EditLabel>
                </VideoButton>
              )
            })}
          </VideoGrid>
        )}
      </Content>

      {contextMenu && (
        <>
          <ContextMenuBackdrop onClick={() => setContextMenu(null)} />
          <ContextMenu style={{ left: contextMenu.x, top: contextMenu.y }}>
            <ContextMenuItem
              onClick={() => {
                removeVideo(contextMenu.videoId)
                setContextMenu(null)
              }}
            >
              Remove video
            </ContextMenuItem>
          </ContextMenu>
        </>
      )}
    </Container>
  )
}
