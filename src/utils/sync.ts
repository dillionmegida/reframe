export function setupVideoSync(
  source: HTMLVideoElement,
  preview: HTMLVideoElement,
  threshold = 0.05
): () => void {
  const onPlay = () => preview.play()
  const onPause = () => preview.pause()
  const onSeeked = () => {
    preview.currentTime = source.currentTime
  }
  const onTimeUpdate = () => {
    if (Math.abs(preview.currentTime - source.currentTime) > threshold) {
      preview.currentTime = source.currentTime
    }
  }

  source.addEventListener('play', onPlay)
  source.addEventListener('pause', onPause)
  source.addEventListener('seeked', onSeeked)
  source.addEventListener('timeupdate', onTimeUpdate)

  return () => {
    source.removeEventListener('play', onPlay)
    source.removeEventListener('pause', onPause)
    source.removeEventListener('seeked', onSeeked)
    source.removeEventListener('timeupdate', onTimeUpdate)
  }
}
