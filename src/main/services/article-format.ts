// Pure formatting helpers for articles (no DB / IO) — scene-transition parsing
// and post-HTML building. Kept separate so they're unit-testable.
import type { ArticleBlock, H3Mode } from '@shared/types'

// A situation marks a chapter break when its notes contain "場面転換". An optional
// title may follow in （）or () (full- or half-width).
export function parseSceneTransition(memo: string): { isBreak: boolean; title: string | null } {
  if (!/場面転換/.test(memo)) return { isBreak: false, title: null }
  const m = memo.match(/場面転換\s*[（(]\s*([^）)]*?)\s*[）)]/)
  return { isBreak: true, title: m && m[1].trim() ? m[1].trim() : null }
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// `imageFor` resolves an image block to its <img> attributes (URL + optional WP
// media id). Returns null to skip the image.
export function buildArticleHtml(
  a: { intro: string; blocks: ArticleBlock[]; h3_mode?: H3Mode },
  imageFor: (b: ArticleBlock) => { url: string; mediaId?: number } | null
): string {
  const mode: H3Mode = a.h3_mode ?? 'dialogue'
  const out: string[] = []
  if (a.intro.trim()) out.push(`<p>${esc(a.intro.trim())}</p>`)
  for (const b of a.blocks) {
    if (b.kind === 'h2') out.push(`<h2>${esc(b.text)}</h2>`)
    else if (b.kind === 'chapterDesc') out.push(`<p>${esc(b.text)}</p>`)
    else if (b.kind === 'customHtml') {
      if (b.text.trim()) out.push(b.text) // raw ad HTML, not escaped
    } else if (b.kind === 'dialogue') {
      // In imageName mode the h3 comes from the image block instead.
      if (mode === 'dialogue') out.push(`<h3>${esc(b.text)}</h3>`)
    } else if (b.kind === 'image') {
      if (mode === 'imageName' && b.text.trim()) out.push(`<h3>${esc(b.text)}</h3>`)
      const img = imageFor(b)
      if (img) {
        const cls = img.mediaId ? ` class="wp-image-${img.mediaId}"` : ''
        out.push(`<figure><img src="${img.url}"${cls} alt="${esc(b.text)}" /></figure>`)
      }
    }
  }
  return out.join('\n')
}
