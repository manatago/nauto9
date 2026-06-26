import { describe, it, expect } from 'vitest'
import { splitColumns } from '../src/renderer/src/lib/bubble'

const cols = (s: string): string[] => splitColumns(s, 12, 13).map((c) => c.join(''))

describe('splitColumns', () => {
  it('breaks at punctuation, then balances 文節 without splitting a word', () => {
    // "じゃなくて" must NOT be split; break after だけ.
    expect(cols('ふふん、こうなったら見るだけじゃなくていいわよ？')).toEqual([
      'ふふん、',
      'こうなったら見るだけ',
      'じゃなくていいわよ？'
    ])
  })

  it('treats … as a forced break but keeps a trailing ♡ attached', () => {
    expect(cols('あっ…みんなの熱い視線、感じるわ…♡')).toEqual([
      'あっ…',
      'みんなの熱い視線、',
      '感じるわ…♡'
    ])
  })

  it('does not break inside から (single particle か starts a multi-particle)', () => {
    // No forced punctuation; should stay together (short) and never split から.
    expect(cols('だからやめて')).toEqual(['だからやめて'])
  })
})
