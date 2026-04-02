import { useState, useCallback, useMemo, DragEvent, useRef, useEffect } from 'react'
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
  display: flex;
  overflow: hidden;
`

const LeftPanel = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  min-width: 0;
`

const RightPanel = styled.div<{ $width: number }>`
  width: ${(p) => p.$width}px;
  border-left: 1px solid #2a2a2a;
  background: #161616;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
  position: relative;
`

const ResizeHandle = styled.div`
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(249, 115, 22, 0.3);
  }
`

const EmptyState = styled.div`
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
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

const VideoButton = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: ${(p) => (p.$selected ? 'rgba(249, 115, 22, 0.15)' : 'transparent')};
  border: 1px solid ${(p) => (p.$selected ? 'rgba(249, 115, 22, 0.3)' : 'transparent')};
  cursor: pointer;
  text-align: left;
  transition: background-color 0.2s, border-color 0.2s;

  &:hover {
    background: ${(p) => (p.$selected ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)')};
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

const PreviewContainer = styled.div`
  aspect-ratio: 16 / 9;
  background: #0e0e0e;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`

const PreviewVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`

const PlayButton = styled.button`
  position: absolute;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(249, 115, 22, 0.9);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, background-color 0.2s, opacity 0.2s;
  opacity: 0;

  ${PreviewContainer}:hover & {
    opacity: 1;
  }

  &:hover {
    transform: scale(1.1);
    background: #f97316;
  }
`

const VideoControls = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.75rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  display: flex;
  align-items: center;
  gap: 0.75rem;
`

const ControlButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`

const ProgressBar = styled.div`
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  cursor: pointer;
  position: relative;

  &:hover {
    height: 6px;
  }
`

const ProgressFill = styled.div<{ $progress: number }>`
  height: 100%;
  width: ${(p) => p.$progress}%;
  background: #f97316;
  border-radius: 2px;
  transition: width 0.1s linear;
`

const TimeDisplay = styled.span`
  font-size: 0.75rem;
  color: #e5e5e5;
  font-family: 'IBM Plex Mono', monospace;
  flex-shrink: 0;
  min-width: 90px;
  text-align: right;
`

const DetailsSection = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #2a2a2a;
`

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  font-size: 0.8125rem;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(42, 42, 42, 0.5);
  }
`

const DetailLabel = styled.span`
  color: #6b7280;
`

const DetailValue = styled.span`
  color: #e5e5e5;
  font-weight: 500;
`

const EditButton = styled.button`
  width: calc(100% - 2rem);
  margin: 1rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 0.25rem;
  background: #f97316;
  color: #000;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(249, 115, 22, 0.9);
  }
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

const ContextMenuItemNeutral = styled.button`
  width: 100%;
  text-align: left;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  color: #e5e5e5;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
`

const Modal = styled.div`
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  padding: 1.25rem;
  min-width: 320px;
  max-width: 90vw;
`

const ModalTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 500;
  color: #e5e5e5;
  margin: 0 0 1rem 0;
`

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: #0e0e0e;
  border: 1px solid #2a2a2a;
  border-radius: 0.25rem;
  color: #e5e5e5;
  margin-bottom: 1rem;

  &:focus {
    outline: none;
    border-color: #f97316;
  }
`

const ModalButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
`

const ModalButton = styled.button<{ $primary?: boolean }>`
  padding: 0.375rem 0.875rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.25rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
  background: ${(p) => (p.$primary ? '#f97316' : '#2a2a2a')};
  color: ${(p) => (p.$primary ? '#000' : '#e5e5e5')};

  &:hover {
    background: ${(p) => (p.$primary ? 'rgba(249, 115, 22, 0.9)' : '#3a3a3a')};
  }
`

const Toast = styled.div<{ $type: 'error' | 'success' }>`
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.625rem 1.25rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  z-index: 70;
  background: ${(p) => (p.$type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)')};
  color: #fff;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
`

function computeOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  ratio: '9:16' | '4:5' | '1:1'
): { outputWidth: number; outputHeight: number } {
  const ratioMap = {
    '9:16': 9 / 16,
    '4:5': 4 / 5,
    '1:1': 1,
  }

  const outAspect = ratioMap[ratio]
  const vidAspect = sourceWidth / sourceHeight

  let outputWidth: number
  let outputHeight: number

  if (outAspect < vidAspect) {
    // Output narrower than source — height-limited
    // Use full source height, derive width from ratio
    outputHeight = sourceHeight
    outputWidth = Math.floor((outputHeight * outAspect) / 2) * 2
  } else {
    // Output wider than source — width-limited
    outputWidth = sourceWidth
    outputHeight = Math.floor((outputWidth / outAspect) / 2) * 2
  }

  return { outputWidth, outputHeight }
}

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
  const [renameModal, setRenameModal] = useState<{ videoId: string; currentName: string; newName: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = localStorage.getItem('reframe.rightPanelWidth')
    return saved ? parseInt(saved, 10) : 320
  })
  const rightPanelWidthRef = useRef(rightPanelWidth)
  
  useEffect(() => {
    rightPanelWidthRef.current = rightPanelWidth
    localStorage.setItem('reframe.rightPanelWidth', String(rightPanelWidth))
  }, [rightPanelWidth])
  
  const [isResizing, setIsResizing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Format time as MM:SS
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  // Handle time updates from video
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }, [])

  // Handle seeking
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const progress = Math.max(0, Math.min(1, clickX / rect.width))
    const newTime = progress * duration
    videoRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  // Restore selected video from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash) {
      const video = videos.find((v) => v.id === hash)
      if (video) {
        setSelectedVideoId(hash)
      }
    }
  }, [videos])

  const processFile = useCallback(
    async (filePath: string) => {
      setLoading(true)
      setError(null)
      try {
        const meta = await window.electron.getVideoMetadata(filePath)
        const outputRatio: '9:16' | '4:5' | '1:1' = '9:16'
        const { outputWidth, outputHeight } = computeOutputDimensions(
          meta.width,
          meta.height,
          outputRatio
        )

        const videoId = addVideo(projectId, {
          videoPath: filePath,
          videoDuration: meta.duration,
          videoWidth: meta.width,
          videoHeight: meta.height,
          videoFps: meta.fps,
          outputRatio,
          outputWidth,
          outputHeight,
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

  const handleSelectVideo = useCallback((videoId: string | null) => {
    setSelectedVideoId(videoId)
    if (videoId) {
      window.location.hash = videoId
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setIsPlaying(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const startX = e.clientX
    const startWidth = rightPanelWidthRef.current

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      const newWidth = Math.max(240, Math.min(600, startWidth + delta))
      setRightPanelWidth(newWidth)
      rightPanelWidthRef.current = newWidth
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('reframe.rightPanelWidth', String(rightPanelWidthRef.current))
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleDoubleClickVideo = useCallback(
    (videoId: string) => {
      const video = useAppStore.getState().getVideo(videoId)
      if (video) {
        loadEditorProject(video)
        navigate({ view: 'editor', projectId, videoId })
      }
    },
    [projectId, navigate, loadEditorProject]
  )

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleRenameVideo = useCallback(
    async (videoId: string, newName: string) => {
      const video = useAppStore.getState().getVideo(videoId)
      if (!video) return

      const oldPath = video.videoPath
      const dir = oldPath.substring(0, oldPath.lastIndexOf('/'))
      const ext = oldPath.split('.').pop() || ''
      const newPath = `${dir}/${newName}${ext ? '.' + ext : ''}`

      // Check for duplicate names in the same project
      const projectVideos = videos.filter((v) => v.projectId === projectId)
      const duplicate = projectVideos.find((v) => {
        if (v.id === videoId) return false
        const vName = v.videoPath.split('/').pop()?.replace(/\.[^.]+$/, '')
        return vName === newName
      })

      if (duplicate) {
        setToast({ message: 'A video with that name already exists in this project', type: 'error' })
        setTimeout(() => setToast(null), 3000)
        return
      }

      try {
        const result = await window.electron.renameFile(oldPath, newPath)
        if (result.success) {
          useAppStore.getState().updateVideo(videoId, { videoPath: result.newPath })
          setToast({ message: 'File renamed successfully', type: 'success' })
          setTimeout(() => setToast(null), 2000)
        }
      } catch (e: any) {
        setToast({ message: e.message || 'Failed to rename file', type: 'error' })
        setTimeout(() => setToast(null), 3000)
      }
    },
    [projectId, videos]
  )

  const openRenameModal = useCallback(
    (videoId: string) => {
      const video = useAppStore.getState().getVideo(videoId)
      if (!video) return
      const fileName = video.videoPath.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
      setRenameModal({ videoId, currentName: fileName, newName: fileName })
    },
    []
  )

  if (!project) return null

  const sorted = [...videos].sort((a, b) => b.addedAt - a.addedAt)
  const selectedVideo = selectedVideoId ? videos.find((v) => v.id === selectedVideoId) : null

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
        <LeftPanel>
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
                    $selected={selectedVideoId === v.id}
                    onClick={() => handleSelectVideo(v.id)}
                    onDoubleClick={() => handleDoubleClickVideo(v.id)}
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
        </LeftPanel>

        {sorted.length > 0 && (
          <RightPanel $width={rightPanelWidth}>
            <ResizeHandle onMouseDown={handleResizeStart} />
            {selectedVideo ? (
              <>
                <PreviewContainer onClick={togglePlay}>
                  <PreviewVideo
                    ref={videoRef}
                    src={`file://${selectedVideo.videoPath}`}
                    onEnded={() => setIsPlaying(false)}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                  />
                  <VideoControls onClick={(e) => e.stopPropagation()}>
                    <ControlButton onClick={togglePlay}>
                      {isPlaying ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </ControlButton>
                    <ProgressBar onClick={handleSeek}>
                      <ProgressFill $progress={duration ? (currentTime / duration) * 100 : 0} />
                    </ProgressBar>
                    <TimeDisplay>{formatTime(currentTime)} / {formatTime(duration)}</TimeDisplay>
                  </VideoControls>
                </PreviewContainer>

                <DetailsSection>
                  <DetailRow>
                    <DetailLabel>Filename</DetailLabel>
                    <DetailValue>{selectedVideo.videoPath.split('/').pop()}</DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <DetailLabel>Duration</DetailLabel>
                    <DetailValue>{Math.round(selectedVideo.videoDuration)}s</DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <DetailLabel>Resolution</DetailLabel>
                    <DetailValue>{selectedVideo.videoWidth}x{selectedVideo.videoHeight}</DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <DetailLabel>FPS</DetailLabel>
                    <DetailValue>{selectedVideo.videoFps}</DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <DetailLabel>Output Ratio</DetailLabel>
                    <DetailValue>{selectedVideo.outputRatio}</DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <DetailLabel>Keyframes</DetailLabel>
                    <DetailValue>{selectedVideo.keyframes.length}</DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <DetailLabel>Slices</DetailLabel>
                    <DetailValue>{selectedVideo.slices.length}</DetailValue>
                  </DetailRow>
                </DetailsSection>

                <EditButton onClick={() => handleDoubleClickVideo(selectedVideo.id)}>
                  Open in Editor
                </EditButton>
              </>
            ) : (
              <EmptyState>Select a video to view details</EmptyState>
            )}
          </RightPanel>
        )}
      </Content>

      {contextMenu && (
        <>
          <ContextMenuBackdrop onClick={() => setContextMenu(null)} />
          <ContextMenu style={{ left: contextMenu.x, top: contextMenu.y }}>
            <ContextMenuItemNeutral
              onClick={() => {
                openRenameModal(contextMenu.videoId)
                setContextMenu(null)
              }}
            >
              Edit filename
            </ContextMenuItemNeutral>
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

      {renameModal && (
        <ModalBackdrop onClick={() => setRenameModal(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Rename Video</ModalTitle>
            <ModalInput
              type="text"
              value={renameModal.newName}
              onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameVideo(renameModal.videoId, renameModal.newName)
                  setRenameModal(null)
                }
                if (e.key === 'Escape') {
                  setRenameModal(null)
                }
              }}
              autoFocus
            />
            <ModalButtons>
              <ModalButton onClick={() => setRenameModal(null)}>Cancel</ModalButton>
              <ModalButton
                $primary
                onClick={() => {
                  handleRenameVideo(renameModal.videoId, renameModal.newName)
                  setRenameModal(null)
                }}
              >
                Rename
              </ModalButton>
            </ModalButtons>
          </Modal>
        </ModalBackdrop>
      )}

      {toast && <Toast $type={toast.type}>{toast.message}</Toast>}
    </Container>
  )
}
