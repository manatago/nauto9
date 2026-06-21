import { describe, it, expect } from 'vitest'
import { cleanGrokLine, classifyScene } from '../src/main/services/grok-format'

describe('cleanGrokLine', () => {
  it('extracts the quoted spoken line', () => {
    expect(cleanGrokLine('「こんにちは」')).toBe('こんにちは')
  })
  it('keeps full-width （）inner-monologue markers', () => {
    expect(cleanGrokLine('（…どうしよう、見られてる…）')).toBe('（…どうしよう、見られてる…）')
  })
  it('strips <think> blocks and stray quotes', () => {
    expect(cleanGrokLine('<think>x</think>\n"えへへ"')).toBe('えへへ')
  })
})

const ctx = (over: Partial<{ situation: string; samples: string[]; visual: string }> = {}) => ({
  situation: '',
  samples: [] as string[],
  visual: '',
  ...over
})

describe('classifyScene', () => {
  it('detects an explicit inner-voice request in the notes', () => {
    expect(classifyScene(ctx({ samples: ['心の声で'] })).wantsInner).toBe(true)
  })
  it('detects kissing from visual tags or Japanese text', () => {
    expect(classifyScene(ctx({ visual: '1girl, french kiss' })).kissing).toBe(true)
    expect(classifyScene(ctx({ situation: 'キスしている' })).kissing).toBe(true)
  })
  it('detects closed mouth from the image tags', () => {
    expect(classifyScene(ctx({ visual: 'closed mouth, blush' })).closedMouth).toBe(true)
    expect(classifyScene(ctx({ visual: 'open mouth' })).closedMouth).toBe(false)
  })
  it('a plain scene flags nothing', () => {
    const f = classifyScene(ctx({ situation: 'プールサイドに座る', visual: 'school swimsuit, sitting' }))
    expect(f).toEqual({ wantsInner: false, kissing: false, closedMouth: false })
  })
})
