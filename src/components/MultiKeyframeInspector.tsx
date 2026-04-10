import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import { useEditorStore } from '../store/editorStore'
import type { EasingType } from '../types'
import {
  EaseLinearIcon,
  EaseInIcon,
  EaseOutIcon,
  EaseInOutIcon,
} from './icons'

const Popover = styled.div`
  position: fixed;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 0.5rem;
  padding: 0.75rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 240px;
`

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
`

const Label = styled.span`
  font-size: 0.6875rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const ValueText = styled.span`
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #e5e5e5;
  font-weight: 500;
`

const EasingRow = styled.div`
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
`

const EasingButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 0.375rem;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  background: ${(p) => (p.$active ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)')};
  color: ${(p) => (p.$active ? '#f97316' : '#6b7280')};
  transition: background-color 0.2s, color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${(p) => (p.$active ? 'rgba(249, 115, 22, 0.3)' : 'rgba(255, 255, 255, 0.1)')};
    color: ${(p) => (p.$active ? '#f97316' : '#e5e5e5')};
  }
`

const CheckboxRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
`

const Checkbox = styled.input`
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: #f97316;
`

const CheckboxLabel = styled.label`
  font-size: 0.6875rem;
  color: #e5e5e5;
  cursor: pointer;
  user-select: none;
`

const easingOptions: { value: EasingType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'In' },
  { value: 'ease-out', label: 'Out' },
  { value: 'ease-in-out', label: 'In-Out' },
]

interface Props {
  keyframeIds: string[]
  containerRef: React.RefObject<HTMLDivElement>
}

export default function MultiKeyframeInspector({ keyframeIds, containerRef }: Props) {
  const project = useEditorStore((s) => s.project!)
  const selectKeyframes = useEditorStore((s) => s.selectKeyframes)
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe)

  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Check if clicked on a keyframe dot
        const target = e.target as HTMLElement
        if (target.closest('[data-keyframe-dot]')) {
          return // Don't deselect if clicking another keyframe
        }
        selectKeyframes([])
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') selectKeyframes([])
    }
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [selectKeyframes])

  const keyframes = keyframeIds
    .map((id) => project.keyframes.find((kf) => kf.id === id))
    .filter((kf) => kf !== undefined)

  if (keyframes.length === 0) return null

  // Check if all keyframes have the same easing
  const firstEasing = keyframes[0].easing
  const allSameEasing = keyframes.every((kf) => kf.easing === firstEasing)
  const currentEasing = allSameEasing ? firstEasing : null

  // Check if all keyframes have explicit scale
  const allHaveExplicitScale = keyframes.every((kf) => kf.explicitScale === true)
  const someHaveExplicitScale = keyframes.some((kf) => kf.explicitScale === true)

  const containerRect = containerRef?.current?.getBoundingClientRect()
  const popoverWidth = 260
  const bottomY = containerRect ? containerRect.top - 8 : 100
  const centerX = containerRect ? containerRect.left + containerRect.width / 2 : window.innerWidth / 2
  const left = Math.max(8, Math.min(centerX - popoverWidth / 2, window.innerWidth - popoverWidth - 8))

  const handleEasingChange = (easing: EasingType) => {
    keyframeIds.forEach((id) => {
      updateKeyframe(id, { easing })
    })
  }

  const handleExplicitScaleToggle = (checked: boolean) => {
    keyframeIds.forEach((id) => {
      updateKeyframe(id, { explicitScale: checked })
    })
  }

  return createPortal(
    <Popover
      ref={popoverRef}
      style={{ bottom: window.innerHeight - bottomY, left, width: popoverWidth }}
    >
      <Row>
        <Label>Selected</Label>
        <ValueText>{keyframeIds.length} keyframes</ValueText>
      </Row>

      <CheckboxRow>
        <Checkbox
          type="checkbox"
          id="multi-explicit-scale"
          checked={allHaveExplicitScale}
          ref={(el) => {
            if (el) {
              el.indeterminate = someHaveExplicitScale && !allHaveExplicitScale
            }
          }}
          onChange={(e) => handleExplicitScaleToggle(e.target.checked)}
        />
        <CheckboxLabel htmlFor="multi-explicit-scale">
          With Scale
        </CheckboxLabel>
      </CheckboxRow>

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
            return (
              <EasingButton
                key={opt.value}
                $active={currentEasing === opt.value}
                onClick={() => handleEasingChange(opt.value)}
                title={opt.label}
              >
                <Icon size={20} />
              </EasingButton>
            )
          })}
        </EasingRow>
      </div>
    </Popover>,
    document.body
  )
}
