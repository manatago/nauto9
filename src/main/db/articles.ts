import type {
  ArticleBlock,
  ArticleListItem,
  ArticleSaveInput,
  H3Mode,
  SavedArticle
} from '@shared/types'
import { getDb } from './index'
import { getGeneration } from './batches'
import { now, type Row } from './util'

// Image blocks store a media:// url, but a regenerated image changes path — so we
// refresh image urls from the current generations whenever we load an article.
function refreshBlocks(blocks: ArticleBlock[]): ArticleBlock[] {
  return blocks.map((b) => {
    if (b.kind !== 'image' || b.generation_id == null) return b
    const g = getGeneration(b.generation_id)
    return { ...b, image_url: g?.image_url ?? b.image_url }
  })
}

function toArticle(r: Row): SavedArticle {
  let blocks: ArticleBlock[]
  try {
    blocks = JSON.parse((r.blocks as string) || '[]') as ArticleBlock[]
  } catch {
    blocks = []
  }
  return {
    id: r.id as number,
    batch_id: (r.batch_id as number | null) ?? null,
    title: r.title as string,
    intro: r.intro as string,
    h3_mode: ((r.h3_mode as string) || 'dialogue') as H3Mode,
    blocks: refreshBlocks(blocks),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string
  }
}

export function saveArticle(input: ArticleSaveInput): SavedArticle {
  const db = getDb()
  const blocks = JSON.stringify(input.blocks)
  if (input.id) {
    db.prepare(
      'UPDATE articles SET title = ?, intro = ?, h3_mode = ?, blocks = ?, batch_id = ?, updated_at = ? WHERE id = ?'
    ).run(input.title, input.intro, input.h3_mode, blocks, input.batch_id, now(), input.id)
    return getArticle(input.id)!
  }
  const id = db
    .prepare('INSERT INTO articles (batch_id, title, intro, h3_mode, blocks) VALUES (?, ?, ?, ?, ?)')
    .run(input.batch_id, input.title, input.intro, input.h3_mode, blocks)
    .lastInsertRowid as number
  return getArticle(id)!
}

export function getArticle(id: number): SavedArticle | null {
  const r = getDb().prepare('SELECT * FROM articles WHERE id = ?').get(id) as Row | undefined
  return r ? toArticle(r) : null
}

export function listArticles(): ArticleListItem[] {
  return (
    getDb()
      .prepare('SELECT id, batch_id, title, updated_at FROM articles ORDER BY updated_at DESC, id DESC')
      .all() as Row[]
  ).map((r) => ({
    id: r.id as number,
    batch_id: (r.batch_id as number | null) ?? null,
    title: (r.title as string) || '無題',
    updated_at: r.updated_at as string
  }))
}

export function deleteArticle(id: number): void {
  getDb().prepare('DELETE FROM articles WHERE id = ?').run(id)
}
