import { useState } from 'react'
import styled from 'styled-components'
import { LeftCaretIcon, SettingsIcon } from './icons'
import { useEditorStore } from '../store/editorStore'
import { useAppStore } from '../store/appStore'
import { useExport } from '../contexts/ExportContext'
import type { AspectRatio, TrackingFps } from '../types'
import TrackingSettingsModal from './TrackingSettingsModal'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

type OutputRatio = '9:16' | '4:5' | '1:1' | '16:9'

function computeOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  ratio: OutputRatio
): { outputWidth: number; outputHeight: number } {
  const ratioMap = {
    '9:16': 9 / 16,
    '4:5': 4 / 5,
    '1:1': 1,
    '16:9': 16 / 9,
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

const ratioOptions: { label: string; value: OutputRatio }[] = [
  { label: '9:16', value: '9:16' },
  { label: '4:5', value: '4:5' },
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
]

const Bar = styled.div`
  height: 3rem;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  border-bottom: 1px solid #2a2a2a;
  background: #161616;
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

const Spacer = styled.div`
  flex: 1;
`

const Ghost = styled.div`
  width: 4rem;
`

const IconButton = styled.button`
  color: #6b7280;
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;

  &:hover {
    color: #e5e5e5;
    background: rgba(255, 255, 255, 0.05);
  }
`

const Divider = styled.div`
  width: 1px;
  height: 1.25rem;
  background: #2a2a2a;
`

const RatioGroup = styled.div`
  display: flex;
  gap: 0.25rem;
`

const RatioButton = styled.button<{ $active: boolean }>`
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  background: ${(p) => (p.$active ? '#f97316' : 'transparent')};
  color: ${(p) => (p.$active ? '#000' : '#6b7280')};
  font-weight: ${(p) => (p.$active ? 600 : 400)};

  &:hover {
    background: ${(p) => (p.$active ? 'rgba(249, 115, 22, 0.9)' : 'rgba(255, 255, 255, 0.05)')};
    color: ${(p) => (p.$active ? '#000' : '#e5e5e5')};
  }
`

const TrimText = styled.span`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #6b7280;
`

const StabilizationToggle = styled.button<{ $active: boolean }>`
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  background: ${(p) => (p.$active ? 'rgba(249, 115, 22, 0.15)' : 'transparent')};
  color: ${(p) => (p.$active ? '#f97316' : '#6b7280')};
  font-weight: ${(p) => (p.$active ? 500 : 400)};

  &:hover {
    background: ${(p) => (p.$active ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)')};
    color: ${(p) => (p.$active ? '#f97316' : '#e5e5e5')};
  }
`

const HistoryButton = styled.button<{ $enabled: boolean }>`
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border-radius: 0.375rem;
  border: none;
  cursor: ${(p) => (p.$enabled ? 'pointer' : 'not-allowed')};
  color: ${(p) => (p.$enabled ? '#e5e5e5' : 'rgba(229, 229, 229, 0.3)')};
  background: transparent;
  transition: background-color 0.2s;

  &:hover {
    background: ${(p) => (p.$enabled ? 'rgba(255, 255, 255, 0.05)' : 'transparent')};
  }
`

const ExportButton = styled.button<{ $enabled: boolean }>`
  padding: 0.45rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.375rem;
  border: none;
  cursor: ${(p) => (p.$enabled ? 'pointer' : 'not-allowed')};
  background: ${(p) => (p.$enabled ? '#f97316' : 'rgba(255, 255, 255, 0.05)')};
  color: ${(p) => (p.$enabled ? '#000' : 'rgba(107, 114, 128, 0.4)')};
  transition: background-color 0.2s;

  &:hover {
    background: ${(p) => (p.$enabled ? 'rgba(249, 115, 22, 0.9)' : 'rgba(255, 255, 255, 0.05)')};
  }
`

const TrackButton = styled.button`
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
  font-weight: 500;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: rgba(74, 222, 128, 0.25);
    color: #4ade80;
  }
`

const TrackActionButton = styled.button<{ $variant?: 'apply' | 'discard' }>`
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  background: ${(p) =>
    p.$variant === 'apply'
      ? 'rgba(74, 222, 128, 0.15)'
      : 'rgba(255, 255, 255, 0.05)'};
  color: ${(p) =>
    p.$variant === 'apply' ? '#4ade80' : '#6b7280'};
  font-weight: ${(p) => (p.$variant === 'apply' ? 500 : 400)};

  &:hover {
    background: ${(p) =>
      p.$variant === 'apply'
        ? 'rgba(74, 222, 128, 0.25)'
        : 'rgba(255, 255, 255, 0.1)'};
    color: ${(p) =>
      p.$variant === 'apply' ? '#4ade80' : '#e5e5e5'};
  }
`

const SmoothnessRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`

const SmoothnessLabel = styled.span`
  font-size: 0.6875rem;
  color: #6b7280;
  white-space: nowrap;
`

const FpsSelect = styled.select`
  padding: 0.2rem 0.4rem;
  font-size: 0.6875rem;
  border-radius: 0.25rem;
  border: 1px solid #2a2a2a;
  background: #161616;
  color: #6b7280;
  cursor: pointer;
  outline: none;

  &:hover {
    border-color: #3a3a3a;
  }
`

const SettingsButton = styled.button`
  /* padding: 0.25rem 0.5rem; */
  font-size: 0.5rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  background: none;
  color: #6b7280;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    color: #e5e5e5;
  }
`

export default function Toolbar({
  trackingFps,
  onTrackingFpsChange,
}: {
  trackingFps: TrackingFps
  onTrackingFpsChange: (fps: TrackingFps) => void
}) {
  const project = useEditorStore((s) => s.project!)
  const currentTime = useEditorStore((s) => s.currentTime)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const setOutputRatio = useEditorStore((s) => s.setOutputRatio)
  const setStabilization = useEditorStore((s) => s.setStabilization)
  const closeProject = useEditorStore((s) => s.closeProject)
  const tracking = useEditorStore((s) => s.tracking)
  const startBoxDraw = useEditorStore((s) => s.startBoxDraw)
  const trackingSettings = useEditorStore((s) => s.trackingSettings)
  const setTrackingSettings = useEditorStore((s) => s.setTrackingSettings)

  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const navigate = useAppStore((s) => s.navigate)
  const route = useAppStore((s) => s.route)
  const basePath = useAppStore((s) => s.basePath)
  const getProject = useAppStore((s) => s.getProject)
  const { startExport } = useExport()

  const exportableSlices = (project.slices || []).filter((s) => s.status === 'keep')
  const hasExportableSlices = exportableSlices.length > 0

  const currentSlice = project.slices.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  )
  const canTrack = !!currentSlice

  const handleExport = async () => {
    if (!hasExportableSlices || !basePath) return

    const reframeProject = route.view === 'editor' ? getProject(route.projectId) : null
    const projectName = reframeProject?.name || 'unknown-project'

    await startExport(exportableSlices, project, basePath, projectName, project.id)
  }

  return (
    <Bar style={{ WebkitAppRegion: 'drag' } as any}>
      <Ghost />

      <IconButton
        onClick={() => {
          closeProject()
          if (route.view === 'editor') {
            navigate({ view: 'project', projectId: route.projectId })
          } else {
            navigate({ view: 'projects' })
          }
        }}
        style={{ WebkitAppRegion: 'no-drag' } as any}
        title="Back to project"
      >
        <LeftCaretIcon size={20} />
      </IconButton>

      <Divider />

      <RatioGroup style={{ WebkitAppRegion: 'no-drag' } as any}>
        {ratioOptions.map((opt) => (
          <RatioButton
            key={opt.value}
            $active={project.outputRatio === opt.value}
            onClick={() => {
              const { outputWidth, outputHeight } = computeOutputDimensions(
                project.videoWidth,
                project.videoHeight,
                opt.value
              )
              setOutputRatio(opt.value, outputWidth, outputHeight)
            }}
          >
            {opt.label}
          </RatioButton>
        ))}
      </RatioGroup>

      <Divider />

      <StabilizationToggle
        $active={project.stabilization?.enabled ?? false}
        onClick={() => {
          const currentEnabled = project.stabilization?.enabled ?? false
          setStabilization(!currentEnabled, project.stabilization?.smoothing ?? 10)
        }}
        style={{ WebkitAppRegion: 'no-drag' } as any}
        title="Toggle video stabilization"
      >
        Stabilize
      </StabilizationToggle>

      <Divider />

      <TrimText style={{ WebkitAppRegion: 'no-drag' } as any}>
        {formatTime(project.trim.start)} – {formatTime(project.trim.end)}
      </TrimText>

      <Spacer />

      <div style={{ display: 'flex', gap: '0.25rem', WebkitAppRegion: 'no-drag' } as any}>
        <HistoryButton $enabled={past.length > 0} onClick={undo} disabled={past.length === 0} title="Undo (Cmd+Z)">
          ↩
        </HistoryButton>
        <HistoryButton $enabled={future.length > 0} onClick={redo} disabled={future.length === 0} title="Redo (Cmd+Shift+Z)">
          ↪
        </HistoryButton>
      </div>

      <Divider />

      {!tracking.active && !tracking.drawingBox && tracking.results.length === 0 && (
        <>
          <TrackButton
            onClick={() => currentSlice && startBoxDraw(currentSlice.id)}
            disabled={!canTrack}
            style={{ 
              WebkitAppRegion: 'no-drag',
              opacity: canTrack ? 1 : 0.5,
              cursor: canTrack ? 'pointer' : 'not-allowed',
            } as any}
            title={
              canTrack
                ? "Track a subject across the current slice to auto-generate keyframes"
                : "Move playhead inside a slice to enable tracking"
            }
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Track subject</span>
              <span
                style={{
                  fontSize: '0.65em',
                  padding: '0.15rem 0.35rem',
                  background: 'rgba(255, 255, 255, 0.18)',
                  color: 'rgba(255, 255, 255, 0.9)',
                  borderRadius: '999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                }}
              >
                Beta
              </span>
            </span>
          </TrackButton>
          <SettingsButton
            onClick={() => setShowSettingsModal(true)}
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="Tracking settings"
          >
            <SettingsIcon size={16} />
          </SettingsButton>
        </>
      )}

      {showSettingsModal && (
        <TrackingSettingsModal
          settings={trackingSettings}
          trackingFps={trackingFps}
          onTrackingFpsChange={onTrackingFpsChange}
          onSave={setTrackingSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      <ExportButton
        onClick={handleExport}
        disabled={!hasExportableSlices}
        $enabled={hasExportableSlices}
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {hasExportableSlices
          ? `Export ${exportableSlices.length} Slice${exportableSlices.length !== 1 ? 's' : ''}`
          : 'Export'}
      </ExportButton>
    </Bar>
  )
}
