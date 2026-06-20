// Compose a WordPress-style article (preview) from a batch: an LLM-written title
// and intro, chapter headings at 場面転換 markers, and each image preceded by its
// dialogue (h3). The HTML is built for the future posting step; the renderer
// previews the structured blocks and can edit / regenerate text.
import type { Article, ArticleBlock, ArticleRegenInput } from '@shared/types'
import * as batches from '../db/batches'
import * as sit from '../db/situations'
import * as repo from '../db/repo'
import { generateText } from './llm'

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
  const blocks: ArticleBlock[] = []
  let lastSituationId: number | null = null

  for (const g of gens) {
    if (g.situation_id !== lastSituationId) {
      lastSituationId = g.situation_id
      const s = g.situation_id ? sit.getSituation(g.situation_id) : null
      if (s) {
        const st = parseSceneTransition(s.dialogue_samples)
        if (st.isBreak) {
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
      text: '',
      generation_id: g.id,
      image_url: g.image_url,
      situation_id: g.situation_id
    })
  }

  return { batch_id: batchId, title, intro, blocks }
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
}

export function buildArticleHtml(article: Article): string {
  const out: string[] = []
  if (article.intro.trim()) out.push(`<p>${esc(article.intro.trim())}</p>`)
  for (const b of article.blocks) {
    if (b.kind === 'h2') out.push(`<h2>${esc(b.text)}</h2>`)
    else if (b.kind === 'chapterDesc') out.push(`<p>${esc(b.text)}</p>`)
    else if (b.kind === 'dialogue') out.push(`<h3>${esc(b.text)}</h3>`)
    else if (b.kind === 'image' && b.image_url)
      out.push(`<figure><img src="${b.image_url}" alt="" /></figure>`)
  }
  return out.join('\n')
}
