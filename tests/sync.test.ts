import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupVideoSync } from '../src/utils/sync'

/**
 * Mock HTMLVideoElement using a minimal EventTarget-based stub.
 */
function createMockVideo(initialTime = 0) {
  const listeners: Record<string, Set<Function>> = {}
  const mock = {
    currentTime: initialTime,
    play: vi.fn(),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = new Set()
      listeners[event].add(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: Function) => {
      listeners[event]?.delete(handler)
    }),
    // Helper to fire an event on this mock
    _emit(event: string) {
      listeners[event]?.forEach((fn) => fn())
    },
    _listenerCount(event: string) {
      return listeners[event]?.size ?? 0
    },
  }
  return mock as unknown as HTMLVideoElement & {
    _emit: (event: string) => void
    _listenerCount: (event: string) => number
  }
}

describe('setupVideoSync', () => {
  let source: ReturnType<typeof createMockVideo>
  let preview: ReturnType<typeof createMockVideo>

  beforeEach(() => {
    source = createMockVideo(0)
    preview = createMockVideo(0)
  })

  it('registers event listeners on source', () => {
    setupVideoSync(source, preview)

    expect(source.addEventListener).toHaveBeenCalledWith('play', expect.any(Function))
    expect(source.addEventListener).toHaveBeenCalledWith('pause', expect.any(Function))
    expect(source.addEventListener).toHaveBeenCalledWith('seeked', expect.any(Function))
    expect(source.addEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function))
  })

  it('calls preview.play() on source play event', () => {
    setupVideoSync(source, preview)
    source._emit('play')

    expect(preview.play).toHaveBeenCalledTimes(1)
  })

  it('calls preview.pause() on source pause event', () => {
    setupVideoSync(source, preview)
    source._emit('pause')

    expect(preview.pause).toHaveBeenCalledTimes(1)
  })

  it('syncs preview.currentTime on source seeked event', () => {
    setupVideoSync(source, preview)
    source.currentTime = 15.5
    source._emit('seeked')

    expect(preview.currentTime).toBe(15.5)
  })

  it('syncs preview.currentTime on timeupdate when drift exceeds threshold', () => {
    setupVideoSync(source, preview, 0.05)
    source.currentTime = 10.0
    preview.currentTime = 9.9 // drift of 0.1 > threshold of 0.05
    source._emit('timeupdate')

    expect(preview.currentTime).toBe(10.0)
  })

  it('does NOT sync on timeupdate when drift is within threshold', () => {
    setupVideoSync(source, preview, 0.05)
    source.currentTime = 10.0
    preview.currentTime = 9.97 // drift of 0.03 < threshold of 0.05
    source._emit('timeupdate')

    expect(preview.currentTime).toBe(9.97) // unchanged
  })

  it('uses default threshold of 0.05', () => {
    setupVideoSync(source, preview)
    source.currentTime = 5.0
    preview.currentTime = 4.96 // drift of 0.04 < 0.05
    source._emit('timeupdate')

    expect(preview.currentTime).toBe(4.96) // unchanged

    preview.currentTime = 4.94 // drift of 0.06 > 0.05
    source._emit('timeupdate')

    expect(preview.currentTime).toBe(5.0) // synced
  })

  it('cleanup function removes all event listeners', () => {
    const cleanup = setupVideoSync(source, preview)

    expect(source._listenerCount('play')).toBe(1)
    expect(source._listenerCount('pause')).toBe(1)
    expect(source._listenerCount('seeked')).toBe(1)
    expect(source._listenerCount('timeupdate')).toBe(1)

    cleanup()

    expect(source.removeEventListener).toHaveBeenCalledTimes(4)
    expect(source._listenerCount('play')).toBe(0)
    expect(source._listenerCount('pause')).toBe(0)
    expect(source._listenerCount('seeked')).toBe(0)
    expect(source._listenerCount('timeupdate')).toBe(0)
  })

  it('events have no effect after cleanup', () => {
    const cleanup = setupVideoSync(source, preview)
    cleanup()

    source._emit('play')
    source._emit('pause')
    source.currentTime = 20
    source._emit('seeked')

    expect(preview.play).not.toHaveBeenCalled()
    expect(preview.pause).not.toHaveBeenCalled()
    expect(preview.currentTime).toBe(0) // unchanged
  })
})
