import { describe, it, expect } from 'vitest'
import { cleanLine, tidy, looksGarbled, fillTemplate } from '../src/main/services/ollama'

describe('tidy', () => {
  it('strips a leading bullet copied from few-shot examples', () => {
    expect(tidy('- みんなは何時頃来た？')).toBe('みんなは何時頃来た？')
  })
  it('strips a leading （小声） stage-direction prefix', () => {
    expect(tidy('（小声）えへへ……')).toBe('えへへ……')
  })
  it('strips a "小声）：" fragment', () => {
    expect(tidy('小声）：はぅ…私もそれに倣っちゃおうかな？')).toBe(
      'はぅ…私もそれに倣っちゃおうかな？'
    )
  })
  it('drops a truncated trailing （苦笑 and a nested 『…』', () => {
    expect(tidy('どんな顔して...（苦笑')).toBe('どんな顔して...')
    expect(tidy('どうかな？可愛い…『だよねぇ〜』')).toBe('どうかな？可愛い…')
  })
  it('keeps a genuine parenthetical utterance', () => {
    expect(tidy('（あっ……）')).toBe('あっ……')
  })
})

describe('cleanLine', () => {
  it('extracts the quoted line and drops <think> blocks', () => {
    expect(cleanLine('<think>reasoning</think>\n「こんにちは」')).toBe('こんにちは')
  })
  it('falls back to the first non-empty line', () => {
    expect(cleanLine('\n\nどうかな？\n次の行')).toBe('どうかな？')
  })
})

describe('looksGarbled', () => {
  it('flags Chinese finance garbage / latin runs / kanji-only / 彼女', () => {
    expect(looksGarbled('应收账款管理是企业财务管理的重要组成部分')).toBe(true)
    expect(looksGarbled('WebAPI、プールサイドじゃん')).toBe(true)
    expect(looksGarbled('スカーフ飞んでしまわないように')).toBe(true)
    expect(looksGarbled('彼女たちは水着になっている')).toBe(true)
  })
  it('passes clean Japanese lines', () => {
    expect(looksGarbled('お腹をお見せするわけには参りませんのよ')).toBe(false)
    expect(looksGarbled('御坂美琴、待ってくださいまし')).toBe(false)
  })
  it('flags empty', () => {
    expect(looksGarbled('')).toBe(true)
  })
})

describe('fillTemplate', () => {
  it('substitutes placeholders with fallbacks', () => {
    const out = fillTemplate('{character}/{traits}/{story}/{story_desc}/{situation}', {
      character: '撫子',
      traits: '',
      story: '',
      storyDesc: '',
      situation: 'プール',
      visual: '',
      samples: [],
      avoid: []
    })
    expect(out).toBe('撫子/（特になし）/（未設定）/（説明なし）/プール')
  })
})
