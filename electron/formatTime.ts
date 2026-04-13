export function formatTimeForFilename(seconds: number): string {
  const roundedSeconds = Math.round(seconds)
  if (roundedSeconds < 60) {
    return `${roundedSeconds}s`
  }
  const mins = Math.floor(roundedSeconds / 60)
  const secs = roundedSeconds % 60
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`
}
