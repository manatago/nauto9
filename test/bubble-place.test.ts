import { describe, it, expect } from 'vitest'
import { bestBackgroundBox } from '../src/main/services/bubble-place'

// Build a w×h foreground mask with a filled foreground rectangle (value 1).
function maskWithFg(w: number, h: number, fx0: number, fy0: number, fx1: number, fy1: number): Float32Array {
  const m = new Float32Array(w * h)
  for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) m[y * w + x] = 1
  return m
}

describe('bestBackgroundBox', () => {
  it('avoids the foreground blob (lands on background)', () => {
    // Subject occupies the left half; the right half is background.
    const m = maskWithFg(100, 100, 0, 0, 50, 100)
    const r = bestBackgroundBox(m, 100, 100, 20, 20)
    expect(r.meanFg).toBe(0) // pure background found
    expect(r.x).toBeGreaterThanOrEqual(50) // box sits in the right (bg) half
  })

  it('reports high foreground when the box cannot avoid the subject', () => {
    // Subject fills everything → no background anywhere.
    const m = maskWithFg(40, 40, 0, 0, 40, 40)
    const r = bestBackgroundBox(m, 40, 40, 10, 10)
    expect(r.meanFg).toBe(1)
  })

  it('keeps the box fully inside the mask', () => {
    const m = maskWithFg(60, 60, 0, 0, 30, 60)
    const r = bestBackgroundBox(m, 60, 60, 25, 25)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + 25).toBeLessThanOrEqual(60)
    expect(r.y + 25).toBeLessThanOrEqual(60)
  })
})
