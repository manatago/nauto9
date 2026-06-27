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

type EmoTag = { tag: string; label: string; score: number }
const ctx = (
  over: Partial<{ situation: string; samples: string[]; visual: string; emotion: EmoTag[] }> = {}
) => ({
  situation: '',
  samples: [] as string[],
  visual: '',
  ...over
})
const emo = (...tags: string[]): EmoTag[] => tags.map((t) => ({ tag: t, label: t, score: 0.9 }))

describe('classifyScene', () => {
  it('detects an explicit inner-voice request in the notes', () => {
    expect(classifyScene(ctx({ samples: ['心の声で'] })).wantsInner).toBe(true)
  })
  it('detects kissing from visual tags or Japanese text', () => {
    expect(classifyScene(ctx({ visual: '1girl, french kiss' })).kissing).toBe(true)
    expect(classifyScene(ctx({ situation: 'キスしている' })).kissing).toBe(true)
  })
  it('detects closed mouth from the prompt when no image tags', () => {
    expect(classifyScene(ctx({ visual: 'closed mouth, blush' })).closedMouth).toBe(true)
    expect(classifyScene(ctx({ visual: 'open mouth' })).closedMouth).toBe(false)
  })
  it('prefers detected image tags for mouth state', () => {
    // image says open → not closed, even if the prompt says closed
    expect(classifyScene(ctx({ visual: 'closed mouth', emotion: emo('open_mouth') })).closedMouth).toBe(
      false
    )
    expect(classifyScene(ctx({ emotion: emo('closed_mouth', 'blush') })).closedMouth).toBe(true)
  })
  it('a plain scene flags nothing', () => {
    const f = classifyScene(ctx({ situation: 'プールサイドに座る', visual: 'school swimsuit, sitting' }))
    expect(f).toEqual({ wantsInner: false, kissing: false, closedMouth: false })
  })
})
