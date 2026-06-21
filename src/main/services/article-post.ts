// Turn an (edited) article into a WordPress draft: build the post HTML, upload
// the webp images, pick a category + tags + featured image, create the draft.
import type { ArticlePostInput, ArticlePostResult } from '@shared/types'
import * as repo from '../db/repo'
import { generateText } from './llm'
import { decodeDataUrl } from './images'
import { buildArticleHtml } from './article-format'
import {
  createDraft,
  findOrCreateTag,
  listCategories,
  uploadMedia,
  wpConfigFrom,
  type WpConfig
} from './wordpress'

// Upload each (webp) image to WordPress media, then create a draft post whose
// body uses the uploaded URLs. Tags / publish date are left for the user.
export async function postArticleToWordpress(
  input: ArticlePostInput
): Promise<ArticlePostResult> {
  const cfg = wpConfigFrom(
    repo.getSetting('WP_SITE_URL'),
    repo.getSetting('WP_USERNAME'),
    repo.getSetting('WP_APP_PASSWORD')
  )

  // image name (= h3/alt) per generation, used as the media title/caption/alt.
  const nameByGen = new Map<number, string>()
  for (const b of input.blocks)
    if (b.kind === 'image' && b.generation_id != null) nameByGen.set(b.generation_id, b.text)

  const uploaded = new Map<number, { url: string; mediaId: number }>()
  for (const img of input.images) {
    const { buf } = decodeDataUrl(img.data_url)
    const safeName = (img.filename || `image-${img.generation_id}.webp`)
      .replace(/[^\w.-]/g, '_')
      .replace(/_+/g, '_')
    const name = safeName.endsWith('.webp') ? safeName : `${safeName}.webp`
    const title = (nameByGen.get(img.generation_id) ?? '').trim()
    const media = await uploadMedia(
      cfg,
      name,
      'image/webp',
      buf,
      title ? { title, caption: title, altText: title } : undefined
    )
    uploaded.set(img.generation_id, { url: media.source_url, mediaId: media.id })
  }

  const html = buildArticleHtml(input, (b) =>
    b.generation_id != null ? (uploaded.get(b.generation_id) ?? null) : null
  )

  // Best-effort: let the LLM pick the most fitting existing category and suggest
  // ~3 tags from the article. If anything fails, post without them.
  const extra: { categories?: number[]; tags?: number[]; featured_media?: number } =
    await autoCategorizeAndTag(cfg, input).catch(() => ({}))
  // Featured image: a random one of the uploaded images.
  const mediaIds = [...uploaded.values()].map((u) => u.mediaId)
  if (mediaIds.length) extra.featured_media = mediaIds[Math.floor(Math.random() * mediaIds.length)]

  return createDraft(cfg, input.title.trim() || '無題', html, extra)
}

function articleExcerpt(input: ArticlePostInput): string {
  const texts = input.blocks
    .filter((b) => b.kind === 'h2' || b.kind === 'chapterDesc' || b.kind === 'dialogue')
    .map((b) => b.text.trim())
    .filter(Boolean)
  return `タイトル: ${input.title}\n導入: ${input.intro}\n内容: ${texts.join(' / ').slice(0, 1500)}`
}

async function autoCategorizeAndTag(
  cfg: WpConfig,
  input: ArticlePostInput
): Promise<{ categories?: number[]; tags?: number[] }> {
  const excerpt = articleExcerpt(input)
  const out: { categories?: number[]; tags?: number[] } = {}

  // Category: pick the best of the existing categories by number.
  const cats = await listCategories(cfg).catch(() => [])
  if (cats.length) {
    const list = cats.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
    const ans = await generateText(
      '次の記事に最も適したカテゴリを一覧から1つ選び、その番号だけを返してください。',
      `${excerpt}\n\nカテゴリ一覧:\n${list}`,
      16
    ).catch(() => '')
    const n = parseInt((ans.match(/\d+/) ?? [])[0] ?? '', 10)
    if (n >= 1 && n <= cats.length) out.categories = [cats[n - 1].id]
  }

  // Tags: 3 short Japanese tags from the article flow.
  const tagLine = await generateText(
    '記事内容に合うタグを3つ提案します。日本語の短い単語で、カンマ区切りのみ返してください（記号や番号は不要）。',
    excerpt,
    40
  ).catch(() => '')
  const names = tagLine
    .split(/[,、\n]/)
    .map((t) => t.replace(/^[\s#・-]+|[\s]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 3)
  if (names.length) {
    const ids: number[] = []
    for (const name of names) {
      try {
        ids.push(await findOrCreateTag(cfg, name))
      } catch {
        /* skip a tag that fails */
      }
    }
    if (ids.length) out.tags = ids
  }

  return out
}
