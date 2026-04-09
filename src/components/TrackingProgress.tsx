import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

const Container = styled.div`
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(22, 22, 22, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
`

const ProgressTrack = styled.div`
  width: 280px;
  height: 6px;
  background: #2a2a2a;
  border-radius: 9999px;
  overflow: hidden;
`

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  background: #4ade80;
  width: ${(p) => Math.max(0, Math.min(100, p.$pct))}%;
  transition: width 0.3s ease;
  border-radius: 9999px;
`

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const FrameText = styled.span`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #6b7280;
`

const PhaseText = styled.span`
  font-size: 0.75rem;
  color: #9ca3af;
`

const CancelBtn = styled.button`
  padding: 0.35rem 0.75rem;
  font-size: 0.7rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
  transition: background-color 0.2s;

  &:hover {
    background: rgba(248, 113, 113, 0.3);
  }
`

export default function TrackingProgress() {
  const project = useEditorStore((s) => s.project)
  const tracking = useEditorStore((s) => s.tracking)
  const cancelTracking = useEditorStore((s) => s.cancelTracking)

  const pct = Math.round(tracking.progress)
  const isExtracting = pct <= 50
  const phase = isExtracting ? 'Extracting frames...' : 'Tracking subject...'

  const slice = project?.slices.find((s) => s.id === tracking.sliceId)
  const sliceInfo = slice
    ? `Slice ${formatTime(slice.start)} → ${formatTime(slice.end)}`
    : ''

  return (
    <Container>
      <PhaseText>{phase}</PhaseText>
      {sliceInfo && <PhaseText style={{ fontSize: '0.6875rem', opacity: 0.7 }}>{sliceInfo}</PhaseText>}
      <ProgressTrack>
        <ProgressFill $pct={pct} />
      </ProgressTrack>
      <InfoRow>
        <FrameText>{pct}%</FrameText>
        {tracking.totalFrames > 0 && (
          <FrameText>
            Frame {tracking.currentFrame} of {tracking.totalFrames}
          </FrameText>
        )}
      </InfoRow>
      <CancelBtn onClick={cancelTracking}>Cancel</CancelBtn>
    </Container>
  )
}
