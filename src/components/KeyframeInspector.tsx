import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import type { EasingType } from '../types'
import { EaseLinearIcon, EaseInIcon, EaseOutIcon, EaseInOutIcon } from './icons'

function formatTimestamp(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`
}

interface Props {
  keyframeId: string
  anchorX: number
  containerRef?: React.RefObject<HTMLDivElement | null>
}

const easingOptions: { label: string; value: EasingType }[] = [
  { label: 'Linear', value: 'linear' },
  { label: 'Ease In', value: 'ease-in' },
  { label: 'Ease Out', value: 'ease-out' },
  { label: 'Ease In-Out', value: 'ease-in-out' },
]

const Popover = styled.div`
  position: fixed;
  z-index: 9999;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Label = styled.span`
  font-size: 0.625rem;
  letter-spacing: 0.08em;
  color: #6b7280;
  text-transform: uppercase;
`

const ValueText = styled.span`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #e5e5e5;
`

const EasingRow = styled.div`
  display: flex;
  gap: 0.25rem;
`

const EaseButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 0.35rem 0.5rem;
  border-radius: 0.375rem;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => (p.$active ? '#f97316' : 'rgba(255,255,255,0.05)')};
  color: ${(p) => (p.$active ? '#000' : '#6b7280')};
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    background: ${(p) => (p.$active ? 'rgba(249,115,22,0.9)' : 'rgba(255,255,255,0.1)')};
    color: #e5e5e5;
  }
`

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
`

const ActionButton = styled.button<{ $danger?: boolean }>`
  flex: 1;
  font-size: 0.6875rem;
  padding: 0.4rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  background: ${(p) => (p.$danger ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.05)')};
  color: ${(p) => (p.$danger ? '#f87171' : '#e5e5e5')};
  transition: background-color 0.2s;

  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)')};
  }
`

export default function KeyframeInspector({ keyframeId, anchorX, containerRef }: Props) {
  const project = useEditorStore((s) => s.project!)
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe)
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe)
  const deleteKeyframe = useEditorStore((s) => s.deleteKeyframe)
  const cloneKeyframeMinus = useEditorStore((s) => s.cloneKeyframeMinus)

  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape — must be before any early returns
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        selectKeyframe(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') selectKeyframe(null)
    }
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [selectKeyframe])

  const kf = project.keyframes.find((k) => k.id === keyframeId)
  if (!kf) return null

  // Compute fixed position from container bounding rect
  const popoverWidth = 260
  const containerRect = containerRef?.current?.getBoundingClientRect()
  const bottomY = containerRect ? containerRect.top - 8 : 100
  const baseLeft = containerRect ? containerRect.left + anchorX : anchorX
  const left = Math.max(8, Math.min(baseLeft - popoverWidth / 2, window.innerWidth - popoverWidth - 8))

  return createPortal(
    <Popover
      ref={popoverRef}
      style={{ bottom: window.innerHeight - bottomY, left, width: popoverWidth }}
    >
      <Row>
        <Label>Time</Label>
        <ValueText>{formatTimestamp(kf.timestamp)}</ValueText>
      </Row>

      <div>
        <Label>Easing</Label>
        <EasingRow>
          {easingOptions.map((opt) => {
            const Icon =
              opt.value === 'linear'
                ? EaseLinearIcon
                : opt.value === 'ease-in'
                ? EaseInIcon
                : opt.value === 'ease-out'
                ? EaseOutIcon
                : EaseInOutIcon
            const active = kf.easing === opt.value
            return (
              <EaseButton
                key={opt.value}
                $active={active}
                onClick={() => updateKeyframe(keyframeId, { easing: opt.value })}
                title={opt.label}
              >
                <Icon size={18} />
              </EaseButton>
            )
          })}
        </EasingRow>
      </div>

      <Actions>
        <ActionButton onClick={() => cloneKeyframeMinus(keyframeId)}>Clone to -1s</ActionButton>
        <ActionButton
          $danger
          onClick={() => {
            deleteKeyframe(keyframeId)
            selectKeyframe(null)
          }}
        >
          Delete
        </ActionButton>
      </Actions>
    </Popover>,
    document.body
  )
}
