import { describe, it, expect } from 'vitest'
import { parseSceneTransition, buildArticleHtml } from '../src/main/services/article-format'
import type { ArticleBlock } from '@shared/types'

describe('parseSceneTransition', () => {
  it('extracts a full-width parenthesised title', () => {
    expect(parseSceneTransition('場面転換（プールサイドの誘惑）')).toEqual({
      isBreak: true,
      title: 'プールサイドの誘惑'
    })
  })
  it('extracts a half-width parenthesised title', () => {
    expect(parseSceneTransition('場面転換(Pool Side)')).toEqual({ isBreak: true, title: 'Pool Side' })
  })
  it('marks a break with no title', () => {
    expect(parseSceneTransition('メモ\n場面転換')).toEqual({ isBreak: true, title: null })
  })
  it('returns no break for ordinary notes', () => {
    expect(parseSceneTransition('ただの状況メモ')).toEqual({ isBreak: false, title: null })
  })
})

const img = (gid: number) =>
  ({ url: gid === 5 ? 'https://wp/x.webp' : 'media://x', mediaId: gid === 5 ? 42 : undefined })

describe('buildArticleHtml', () => {
  const blocks: ArticleBlock[] = [
    { id: 'h2', kind: 'h2', text: '第一章', generation_id: null, image_url: null, situation_id: 1 },
    { id: 'd', kind: 'dialogue', text: 'こんにちは', generation_id: 5, image_url: null, situation_id: 1 },
    { id: 'i', kind: 'image', text: '撫子が「水着」を着てるところ', generation_id: 5, image_url: null, situation_id: 1 },
    { id: 'ad', kind: 'customHtml', text: '<a href="https://ad">PR</a>', generation_id: null, image_url: null, situation_id: null }
  ]

  it('dialogue mode: h3 = dialogue, img with escaped alt + wp class, raw ad', () => {
    const html = buildArticleHtml({ intro: '導入', h3_mode: 'dialogue', blocks }, (b) => img(b.generation_id ?? 0))
    expect(html).toContain('<p>導入</p>')
    expect(html).toContain('<h2>第一章</h2>')
    expect(html).toContain('<h3>こんにちは</h3>')
    expect(html).toContain('<figure><img src="https://wp/x.webp" class="wp-image-42" alt="撫子が「水着」を着てるところ" /></figure>')
    expect(html).toContain('<a href="https://ad">PR</a>') // ad not escaped
  })

  it('imageName mode: h3 comes from the image name, dialogue heading dropped', () => {
    const html = buildArticleHtml({ intro: '', h3_mode: 'imageName', blocks }, (b) => img(b.generation_id ?? 0))
    expect(html).not.toContain('<h3>こんにちは</h3>')
    expect(html).toContain('<h3>撫子が「水着」を着てるところ</h3>')
  })

  it('escapes quotes/angle brackets in headings', () => {
    const b: ArticleBlock[] = [{ id: 'h', kind: 'h2', text: '<b>"x"</b>', generation_id: null, image_url: null, situation_id: null }]
    expect(buildArticleHtml({ intro: '', blocks: b }, () => null)).toBe('<h2>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</h2>')
  })
})
