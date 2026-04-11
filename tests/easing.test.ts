import { describe, it, expect } from 'vitest'
import { linear, easeIn, easeOut, easeInOut, applyEasing } from '../src/utils/easing'

describe('easing functions', () => {
  describe('linear', () => {
    it('returns input unchanged', () => {
      expect(linear(0)).toBe(0)
      expect(linear(0.5)).toBe(0.5)
      expect(linear(1)).toBe(1)
    })
  })

  describe('easeIn (cubic)', () => {
    it('returns 0 at start and 1 at end', () => {
      expect(easeIn(0)).toBe(0)
      expect(easeIn(1)).toBe(1)
    })

    it('is slower than linear at the start', () => {
      expect(easeIn(0.25)).toBeLessThan(0.25)
      expect(easeIn(0.5)).toBeLessThan(0.5)
    })

    it('computes p^3', () => {
      expect(easeIn(0.5)).toBeCloseTo(0.125)
      expect(easeIn(0.2)).toBeCloseTo(0.008)
    })
  })

  describe('easeOut (cubic)', () => {
    it('returns 0 at start and 1 at end', () => {
      expect(easeOut(0)).toBe(0)
      expect(easeOut(1)).toBe(1)
    })

    it('is faster than linear at the start', () => {
      expect(easeOut(0.25)).toBeGreaterThan(0.25)
      expect(easeOut(0.5)).toBeGreaterThan(0.5)
    })

    it('is symmetric complement of easeIn', () => {
      // easeOut(p) = 1 - easeIn(1 - p)
      expect(easeOut(0.3)).toBeCloseTo(1 - easeIn(0.7))
      expect(easeOut(0.7)).toBeCloseTo(1 - easeIn(0.3))
    })
  })

  describe('easeInOut (cubic)', () => {
    it('returns 0 at start, 0.5 at midpoint, 1 at end', () => {
      expect(easeInOut(0)).toBe(0)
      expect(easeInOut(0.5)).toBeCloseTo(0.5)
      expect(easeInOut(1)).toBe(1)
    })

    it('is slower than linear below 0.5 and faster above', () => {
      expect(easeInOut(0.25)).toBeLessThan(0.25)
      expect(easeInOut(0.75)).toBeGreaterThan(0.75)
    })

    it('is symmetric around 0.5', () => {
      expect(easeInOut(0.3) + easeInOut(0.7)).toBeCloseTo(1)
      expect(easeInOut(0.1) + easeInOut(0.9)).toBeCloseTo(1)
    })
  })

  describe('applyEasing', () => {
    it('dispatches to correct function', () => {
      expect(applyEasing(0.5, 'linear')).toBe(linear(0.5))
      expect(applyEasing(0.5, 'ease-in')).toBe(easeIn(0.5))
      expect(applyEasing(0.5, 'ease-out')).toBe(easeOut(0.5))
      expect(applyEasing(0.5, 'ease-in-out')).toBe(easeInOut(0.5))
    })

    it('falls through to identity for unknown type', () => {
      expect(applyEasing(0.5, 'unknown' as any)).toBe(0.5)
    })
  })
})
