import { describe, it, expect } from 'vitest'
import { slug, safeArcName, generationKey } from '../src/main/services/naming'
import { sumTrainingSteps } from '../src/main/services/novelai'

describe('slug', () => {
  it('keeps Japanese/alnum, collapses the rest to _', () => {
    expect(slug('御坂美琴 (トップレス)!')).toBe('御坂美琴_トップレス_')
  })
  it('caps length and falls back for empties', () => {
    expect(slug('', 10)).toBe('res')
    expect(slug('a'.repeat(60), 8)).toBe('aaaaaaaa')
  })
})

describe('safeArcName', () => {
  it('takes the last segment and replaces illegal chars', () => {
    expect(safeArcName('a/b/c:d?e.png')).toBe('c_d_e.png')
  })
})

describe('generationKey', () => {
  it('builds generations/{slug}/{seq3}-{slug}-{rand7}.png', () => {
    const k = generationKey('夏のプール', 4, 'xxxはプールサイド')
    expect(k).toMatch(/^generations\/夏のプール\/004-xxxはプールサイド-[a-z0-9]{7}\.png$/)
  })
})

describe('sumTrainingSteps', () => {
  it('sums all numeric values (fixed + purchased, varied names)', () => {
    expect(
      sumTrainingSteps({ fixedTrainingStepsLeft: 7046, purchasedTrainingSteps: 6655 })
    ).toBe(13701)
  })
  it('handles missing / non-numeric', () => {
    expect(sumTrainingSteps(undefined)).toBe(0)
    expect(sumTrainingSteps({ a: 'x', b: 5 })).toBe(5)
  })
})
