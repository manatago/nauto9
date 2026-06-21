import { describe, it, expect } from 'vitest'
import {
  stripEyeTagsIfClosed,
  replaceXxx,
  applyCharacterReplacements,
  adaptForBoy,
  isMonochromePrompt
} from '../src/main/services/prompt'

describe('stripEyeTagsIfClosed', () => {
  it('removes color/state eye tags when the scene closes the eyes', () => {
    const c = '1girl, lime green eyes, yellow eyes, {{{wide eyes}}}, shiny eyes, long hair'
    expect(stripEyeTagsIfClosed(c, 'sleeping, closed eyes')).toBe('1girl, long hair')
  })
  it('removes heterochromia even standalone', () => {
    expect(stripEyeTagsIfClosed('1girl, heterochromia, red dress', 'closed eyes')).toBe(
      '1girl, red dress'
    )
  })
  it('keeps non-eye tags that merely contain eye-ish substrings', () => {
    expect(stripEyeTagsIfClosed('1girl, eyeshadow, blue dress', 'closed eyes')).toBe(
      '1girl, eyeshadow, blue dress'
    )
  })
  it('does nothing when the scene is not closed-eyes', () => {
    const c = '1girl, green eyes'
    expect(stripEyeTagsIfClosed(c, 'standing, open mouth')).toBe(c)
  })
  it('also triggers on "eyes closed"', () => {
    expect(stripEyeTagsIfClosed('1girl, blue eyes', 'eyes closed')).toBe('1girl')
  })
})

describe('replaceXxx', () => {
  it('substitutes every xxx with the character name', () => {
    expect(replaceXxx('xxx is happy, xxx smiles', '撫子')).toBe('撫子 is happy, 撫子 smiles')
  })
})

describe('applyCharacterReplacements', () => {
  it('applies case-insensitive literal replacements; empty removes', () => {
    expect(
      applyCharacterReplacements('a school uniform, smiling', [
        { find: 'school uniform', replace: 'swimsuit' },
        { find: 'smiling', replace: '' }
      ])
    ).toBe('a swimsuit, ')
  })
  it('returns input unchanged with no replacements', () => {
    expect(applyCharacterReplacements('hello', [])).toBe('hello')
  })
})

describe('adaptForBoy (reserved; whole-word girl→boy)', () => {
  it('flips standalone girl/girls only when the character is "a boy"', () => {
    expect(adaptForBoy('a girl, two girls', 'a boy')).toBe('a boy, two boys')
    expect(adaptForBoy('a girl', '1girl')).toBe('a girl') // not "a boy" → unchanged
  })
  it('only matches whole words (cowboy / 1girl untouched)', () => {
    // \bgirl\b doesn't match inside "1girl"; "cowboy" has no "girl"
    expect(adaptForBoy('cowboy, 1girl', 'a boy')).toBe('cowboy, 1girl')
  })
})

describe('isMonochromePrompt', () => {
  it('detects monochrome keywords', () => {
    expect(isMonochromePrompt('greyscale, sketch')).toBe(true)
    expect(isMonochromePrompt('full color')).toBe(false)
  })
})
