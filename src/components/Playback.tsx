import { useEditorStore } from '../store/editorStore'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

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
    <div className="h-full flex items-center justify-center gap-4 px-4">
      {/* Step back 5s */}
      <button
        className="text-text-muted hover:text-text-primary text-xs font-mono px-2 py-1 rounded hover:bg-white/5 transition-colors"
        onClick={() => setCurrentTime(currentTime - 5)}
        title="Step back 5s (Shift+←)"
      >
        -5s
      </button>

      {/* Step back 1 frame */}
      <button
        className="text-text-muted hover:text-text-primary text-lg px-2 py-1 rounded hover:bg-white/5 transition-colors"
        onClick={() => setCurrentTime(currentTime - 1 / fps)}
        title="Step back 1 frame (←)"
      >
        ‹
      </button>

      {/* Play/Pause */}
      <button
        className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-black hover:bg-accent/90 transition-colors"
        onClick={() => {
          if (!isPlaying && currentTime >= project.trim.end) {
            setCurrentTime(project.trim.start)
          }
          setPlaying(!isPlaying)
        }}
        title="Play/Pause (Space)"
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
      </button>

      {/* Step forward 1 frame */}
      <button
        className="text-text-muted hover:text-text-primary text-lg px-2 py-1 rounded hover:bg-white/5 transition-colors"
        onClick={() => setCurrentTime(currentTime + 1 / fps)}
        title="Step forward 1 frame (→)"
      >
        ›
      </button>

      {/* Step forward 5s */}
      <button
        className="text-text-muted hover:text-text-primary text-xs font-mono px-2 py-1 rounded hover:bg-white/5 transition-colors"
        onClick={() => setCurrentTime(currentTime + 5)}
        title="Step forward 5s (Shift+→)"
      >
        +5s
      </button>

      {/* Time display */}
      <div className="font-mono text-sm text-text-primary ml-4">
        <span>{formatTime(Math.max(0, relativeTime))}</span>
        <span className="text-text-muted"> / </span>
        <span className="text-text-muted">{formatTime(trimDuration)}</span>
      </div>
    </div>
  )
}
