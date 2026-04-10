import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import type { EasingType, TrackingFps } from '../types'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
`

const Modal = styled.div`
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
  padding: 1.5rem;
  width: 90%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const Title = styled.h2`
  font-size: 1.125rem;
  font-weight: 600;
  color: #e5e5e5;
  margin: 0;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 0.25rem;
  font-size: 1.25rem;
  line-height: 1;
  transition: color 0.2s;

  &:hover {
    color: #e5e5e5;
  }
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: #e5e5e5;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`

const Input = styled.input`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.875rem;
  color: #e5e5e5;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #2a2a2a;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;

  &:focus {
    outline: none;
    border-color: #f97316;
    background: rgba(255, 255, 255, 0.08);
  }
`

const Select = styled.select`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.875rem;
  color: #e5e5e5;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #2a2a2a;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #f97316;
    background: rgba(255, 255, 255, 0.08);
  }

  option {
    background: #161616;
    color: #e5e5e5;
  }
`

const HelpText = styled.span`
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.4;
`

const Note = styled.div`
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: 0.375rem;
  padding: 0.75rem;
  font-size: 0.8125rem;
  color: #d1d5db;
  line-height: 1.5;
`

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
`

const Button = styled.button<{ $primary?: boolean }>`
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  background: ${(p) => (p.$primary ? '#f97316' : 'rgba(255, 255, 255, 0.05)')};
  color: ${(p) => (p.$primary ? '#000' : '#e5e5e5')};

  &:hover {
    background: ${(p) => (p.$primary ? 'rgba(249, 115, 22, 0.9)' : 'rgba(255, 255, 255, 0.1)')};
  }
`

export type AutoEasingType = 'auto' | EasingType

export interface TrackingSettings {
  minDuration: number
  defaultEasing: AutoEasingType
}

interface Props {
  settings: TrackingSettings
  trackingFps: TrackingFps
  onTrackingFpsChange: (fps: TrackingFps) => void
  onSave: (settings: TrackingSettings) => void
  onClose: () => void
}

export default function TrackingSettingsModal({ settings, trackingFps, onTrackingFpsChange, onSave, onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const minDurationRef = useRef<HTMLInputElement>(null)
  const easingRef = useRef<HTMLSelectElement>(null)
  const fpsRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSave = () => {
    const minDuration = parseFloat(minDurationRef.current?.value || '0')
    const defaultEasing = (easingRef.current?.value || 'auto') as AutoEasingType
    const fpsValue = parseInt(fpsRef.current?.value || `${trackingFps}`, 10) as TrackingFps

    if (isNaN(minDuration) || minDuration < 0) {
      alert('Please enter a valid minimum duration (0 or greater)')
      return
    }

    if (fpsValue !== 15 && fpsValue !== 30) {
      alert('Please choose a valid tracking FPS (15 or 30)')
      return
    }

    onTrackingFpsChange(fpsValue)
    onSave({
      minDuration,
      defaultEasing,
    })
    onClose()
  }

  return createPortal(
    <Overlay onClick={onClose}>
      <Modal ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Auto Tracking Settings</Title>
          <CloseButton onClick={onClose}>×</CloseButton>
        </Header>

        <Section>
          <Label>
            Tracking FPS
            <Select ref={fpsRef} defaultValue={trackingFps}>
              <option value={15}>15fps (faster)</option>
              <option value={30}>30fps (precise)</option>
            </Select>
            <HelpText>
              Lower FPS tracks faster but less precisely. Higher FPS is more precise but slower.
            </HelpText>
          </Label>
        </Section>

        <Section>
          <Label>
            Minimum Duration (seconds)
            <Input
              ref={minDurationRef}
              type="number"
              min="0"
              step="0.5"
              defaultValue={settings.minDuration}
            />
            <HelpText>
              Minimum time between auto-generated keyframes. Higher values reduce jumpiness but may
              miss quick movements.
            </HelpText>
          </Label>
        </Section>

        <Section>
          <Label>
            Default Easing
            <Select ref={easingRef} defaultValue={settings.defaultEasing}>
              <option value="auto">Auto (Recommended)</option>
              <option value="linear">Linear</option>
              <option value="ease-in">Ease In</option>
              <option value="ease-out">Ease Out</option>
              <option value="ease-in-out">Ease In-Out</option>
            </Select>
            <HelpText>
              Auto mode selects the best easing based on keyframe spacing for smoother motion.
            </HelpText>
          </Label>
        </Section>

        <Note>
          <strong>Note:</strong> Auto tracking uses computer vision algorithms (not AI) and is still
          experimental. Results may vary depending on video content, lighting, and subject movement.
        </Note>

        <Actions>
          <Button onClick={onClose}>Cancel</Button>
          <Button $primary onClick={handleSave}>
            Save Settings
          </Button>
        </Actions>
      </Modal>
    </Overlay>,
    document.body
  )
}
