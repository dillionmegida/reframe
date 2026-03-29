import { useEffect, useRef } from 'react'
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
}

const easingOptions: { label: string; value: EasingType }[] = [
  { label: 'Linear', value: 'linear' },
  { label: 'Ease In', value: 'ease-in' },
  { label: 'Ease Out', value: 'ease-out' },
  { label: 'Ease In-Out', value: 'ease-in-out' },
]

export default function KeyframeInspector({ keyframeId, anchorX }: Props) {
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

  // Clamp popover position
  const popoverWidth = 260
  const left = Math.max(8, Math.min(anchorX - popoverWidth / 2, window.innerWidth - popoverWidth - 8))

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 bg-panel border border-border rounded-lg shadow-2xl p-3 flex flex-col gap-2.5"
      style={{
        bottom: '100%',
        left,
        width: popoverWidth,
        marginBottom: 8,
      }}
    >
      {/* Timestamp */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Time</span>
        <span className="font-mono text-xs text-text-primary">{formatTimestamp(kf.timestamp)}</span>
      </div>

      {/* Easing buttons */}
      <div>
        <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Easing</span>
        <div className="flex gap-1">
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
              <button
                key={opt.value}
                className={`flex-1 py-1.5 rounded transition-colors flex items-center justify-center ${
                  active ? 'bg-accent text-black' : 'bg-white/5 text-text-muted hover:bg-white/10'
                }`}
                onClick={() => updateKeyframe(keyframeId, { easing: opt.value })}
                title={opt.label}
              >
                <Icon size={18} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-border">
        <button
          className="flex-1 text-[11px] py-1.5 rounded bg-white/5 text-text-primary hover:bg-white/10 transition-colors"
          onClick={() => cloneKeyframeMinus(keyframeId)}
        >
          Clone to -1s
        </button>
        <button
          className="flex-1 text-[11px] py-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          onClick={() => {
            deleteKeyframe(keyframeId)
            selectKeyframe(null)
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
