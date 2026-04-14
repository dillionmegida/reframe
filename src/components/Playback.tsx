import { useEditorStore } from '../store/editorStore'
import styled from 'styled-components'
import { formatTime } from '../utils/formatTime'

const Bar = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0 1rem;
`

const ActionButton = styled.button<{ $size?: 'sm' | 'lg' }>`
  color: #6b7280;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  padding: ${(p) => (p.$size === 'lg' ? '0.25rem 0.5rem' : '0.25rem 0.5rem')};
  font-size: ${(p) => (p.$size === 'lg' ? '1.125rem' : '0.75rem')};
  font-family: 'IBM Plex Mono', monospace;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;

  &:hover {
    color: #e5e5e5;
    background: rgba(255, 255, 255, 0.05);
  }
`

const PlayButton = styled.button`
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: none;
  background: #f97316;
  color: #000;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(249, 115, 22, 0.9);
  }
`

const TimeDisplay = styled.div`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.875rem;
  color: #e5e5e5;
  margin-left: 1rem;

  span:last-child {
    color: #6b7280;
  }
`

export default function Playback() {
  const project = useEditorStore((s) => s.project!)
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setPlaying = useEditorStore((s) => s.setPlaying)
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime)

  const fps = 30
  const trimDuration = project.trim.end - project.trim.start
  const relativeTime = currentTime - project.trim.start

  return (
    <Bar>
      <ActionButton onClick={() => setCurrentTime(currentTime - 5)} title="Step back 5s (Shift+←)">
        -5s
      </ActionButton>

      <ActionButton $size="lg" onClick={() => setCurrentTime(currentTime - 1 / fps)} title="Step back 1 frame (←)">
        ‹
      </ActionButton>

      <PlayButton
        onClick={() => {
          if (!isPlaying && currentTime >= project.trim.end) {
            setCurrentTime(project.trim.start)
          }
          setPlaying(!isPlaying)
        }}
        title="Play/Pause (Space)"
        data-testid="play-button"
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        )}
      </PlayButton>

      <ActionButton $size="lg" onClick={() => setCurrentTime(currentTime + 1 / fps)} title="Step forward 1 frame (→)">
        ›
      </ActionButton>

      <ActionButton onClick={() => setCurrentTime(currentTime + 5)} title="Step forward 5s (Shift+→)">
        +5s
      </ActionButton>

      <TimeDisplay>
        <span>{formatTime(Math.max(0, relativeTime))}</span>
        <span> / </span>
        <span>{formatTime(trimDuration)}</span>
      </TimeDisplay>
    </Bar>
  )
}
