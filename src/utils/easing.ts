import type { EasingType } from '../types'

export function linear(p: number): number {
  return p
}

export function easeIn(p: number): number {
  return p * p * p
}

export function easeOut(p: number): number {
  const inv = 1 - p
  return 1 - inv * inv * inv
}

export function easeInOut(p: number): number {
  if (p < 0.5) {
    return 4 * p * p * p
  }
  const inv = -2 * p + 2
  return 1 - (inv * inv * inv) / 2
}

export function applyEasing(p: number, type: EasingType): number {
  switch (type) {
    case 'linear':
      return linear(p)
    case 'ease-in':
      return easeIn(p)
    case 'ease-out':
      return easeOut(p)
    case 'ease-in-out':
      return easeInOut(p)
    default:
      return p
  }
}
