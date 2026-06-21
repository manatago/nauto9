// Compose a WordPress-style article (preview) from a batch: an LLM-written title
// and intro, chapter headings at 場面転換 markers, and each image preceded by its
// dialogue (h3). The HTML is built for the future posting step; the renderer
// previews the structured blocks and can edit / regenerate text.
import type {
  Article,
  ArticleBlock,
  ArticlePostInput,
  ArticlePostResult,
  ArticleRegenInput,
  H3Mode
} from '@shared/types'
import * as batches from '../db/batches'
import * as sit from '../db/situations'
import * as repo from '../db/repo'
import { generateText } from './llm'
import { decodeDataUrl } from './images'
import { replaceXxx } from './prompt'
import {
  createDraft,
  findOrCreateTag,
  listCategories,
  uploadMedia,
  wpConfigFrom,
  type WpConfig
} from './wordpress'

// Ad-link HTML snippets (stored as a JSON array of strings in settings) inserted
// before the 2nd and later <h2>. Returns [] if unset/invalid.
function adSnippets(): string[] {
  try {
    const arr = JSON.parse(repo.getSetting('AD_LINKS') || '[]') as unknown
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
  } catch {
    return []
  }
}

function storyDescription(storyId: number | null): string {
  if (!storyId) return ''
  return sit.listStories().find((s) => s.id === storyId)?.description ?? ''
}

// A situation marks a chapter break when its notes contain "場面転換". An optional
// title may follow in （）or () (full- or half-width).
function parseSceneTransition(memo: string): { isBreak: boolean; title: string | null } {
  if (!/場面転換/.test(memo)) return { isBreak: false, title: null }
  const m = memo.match(/場面転換\s*[（(]\s*([^）)]*?)\s*[）)]/)
  return { isBreak: true, title: m && m[1].trim() ? m[1].trim() : null }
}

function firstJson(s: string): { title?: string; intro?: string } | null {
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

// ---- LLM helpers ----

async function titleAndIntro(
  charName: string,
  profile: string,
  storyName: string,
  storyDesc: string
): Promise<{ title: string; intro: string }> {
  const system =
    'あなたは成人向け官能小説のブログ編集者です。登場人物はすべて20歳以上の成人です。' +
    '与えられたキャラクター設定と物語の説明から、記事のタイトルと導入文を作ります。' +
    'タイトルは短く魅力的に。導入文は物語の雰囲気を伝える2〜3文。' +
    '出力は次のJSONのみ: {"title": "...", "intro": "..."}'
  const user =
    `キャラクター: ${charName}\nプロフィール: ${profile || '（なし）'}\n` +
    `物語: ${storyName || '（無題）'}\n物語の説明: ${storyDesc || '（なし）'}`
  const raw = await generateText(system, user, 400)
  const j = firstJson(raw)
  if (j?.title) return { title: j.title.trim(), intro: (j.intro ?? '').trim() }
  // Fallback: first line = title, rest = intro.
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  return { title: lines[0] ?? storyName, intro: lines.slice(1).join(' ') }
}

async function chapterTitle(situationName: string, memo: string, storyDesc: string): Promise<string> {
  const system =
    '次の場面に、短い章タイトル（見出し）を1つ付けます。タイトル本文のみを返す。記号や「」は不要。'
  const user = `物語: ${storyDesc || '（なし）'}\n場面: ${situationName}\nメモ: ${memo || '（なし）'}`
  const t = (await generateText(system, user, 40)).split('\n')[0].trim()
  return t.replace(/^[「『"']+/, '').replace(/[」』"']+$/, '') || situationName
}

async function chapterDesc(
  title: string,
  situationName: string,
  memo: string,
  storyDesc: string
): Promise<string> {
  const system =
    'あなたは成人向け官能小説の書き手です。登場人物はすべて20歳以上の成人です。' +
    'これから始まる章が、どういう場面・状況なのかを読者に伝える短い説明（1〜2文）を書きます。説明文のみを返す。'
  const user =
    `物語: ${storyDesc || '（なし）'}\n章タイトル: ${title}\n場面: ${situationName}\nメモ: ${memo || '（なし）'}`
  return (await generateText(system, user, 200)).trim()
}

// ---- compose ----

export async function composeArticle(batchId: number): Promise<Article> {
  const batch = batches.getBatch(batchId)
  if (!batch) throw new Error('バッチが見つかりません')
  const char = batch.character_id ? repo.getCharacter(batch.character_id) : null
  const storyDesc = storyDescription(batch.story_id)

  const { title, intro } = await titleAndIntro(
    char?.name ?? batch.character_name,
    char?.persona ?? '',
    batch.story_name,
    storyDesc
  )

  const gens = batch.generations.filter((g) => g.status === 'success' && g.image_url)
  const ads = adSnippets()
  const blocks: ArticleBlock[] = []
  let lastSituationId: number | null = null
  let h2Count = 0

  for (const g of gens) {
    if (g.situation_id !== lastSituationId) {
      lastSituationId = g.situation_id
      const s = g.situation_id ? sit.getSituation(g.situation_id) : null
      if (s) {
        const st = parseSceneTransition(s.dialogue_samples)
        if (st.isBreak) {
          h2Count++
          // Ad link before every h2 except the first.
          if (h2Count >= 2 && ads.length) {
            blocks.push({
              id: `ad-${s.id}`,
              kind: 'customHtml',
              text: ads[Math.floor(Math.random() * ads.length)],
              generation_id: null,
              image_url: null,
              situation_id: s.id
            })
          }
          const h2 = st.title ?? (await chapterTitle(s.name, s.dialogue_samples, storyDesc))
          blocks.push({
            id: `h2-${s.id}`,
            kind: 'h2',
            text: h2,
            generation_id: null,
            image_url: null,
            situation_id: s.id
          })
          blocks.push({
            id: `desc-${s.id}`,
            kind: 'chapterDesc',
            text: await chapterDesc(h2, s.name, s.dialogue_samples, storyDesc),
            generation_id: null,
            image_url: null,
            situation_id: s.id
          })
        }
      }
    }
    blocks.push({
      id: `dlg-${g.id}`,
      kind: 'dialogue',
      text: g.dialogue,
      generation_id: g.id,
      image_url: null,
      situation_id: g.situation_id
    })
    blocks.push({
      id: `img-${g.id}`,
      kind: 'image',
      // alt = the situation name with xxx replaced by the character name.
      text: replaceXxx(g.situation_name, g.character_name),
      generation_id: g.id,
      image_url: g.image_url,
      situation_id: g.situation_id
    })
  }

  // Ad link after the last image too.
  if (ads.length) {
    blocks.push({
      id: 'ad-end',
      kind: 'customHtml',
      text: ads[Math.floor(Math.random() * ads.length)],
      generation_id: null,
      image_url: null,
      situation_id: null
    })
  }

  return { batch_id: batchId, title, intro, h3_mode: 'dialogue', blocks }
}

// Regenerate a single text block.
export async function regenerateArticleBlock(input: ArticleRegenInput): Promise<string> {
  const batch = batches.getBatch(input.batch_id)
  if (!batch) throw new Error('バッチが見つかりません')
  const char = batch.character_id ? repo.getCharacter(batch.character_id) : null
  const storyDesc = storyDescription(batch.story_id)

  if (input.target === 'title' || input.target === 'intro') {
    const { title, intro } = await titleAndIntro(
      char?.name ?? batch.character_name,
      char?.persona ?? '',
      batch.story_name,
      storyDesc
    )
    return input.target === 'title' ? title : intro
  }

  const s = input.situation_id ? sit.getSituation(input.situation_id) : null
  if (!s) throw new Error('シチュエーションが見つかりません')
  const st = parseSceneTransition(s.dialogue_samples)
  if (input.target === 'h2') {
    return st.title ?? (await chapterTitle(s.name, s.dialogue_samples, storyDesc))
  }
  // chapterDesc
  const h2 = st.title ?? s.name
  return chapterDesc(h2, s.name, s.dialogue_samples, storyDesc)
}

// Build post HTML from an (possibly edited) article. The image src stays the
// local media:// url for preview; the posting step will swap in uploaded URLs.
function esc(s: string): string {
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
