export function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

export function formatTimeForDisplay(seconds: number): string {
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`
  }
  const mins = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

export function formatTimeForFilename(seconds: number): string {
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`
  }
  const mins = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`
}
