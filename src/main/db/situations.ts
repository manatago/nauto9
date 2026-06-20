import type {
  AspectRatio,
  Situation,
  SituationCreateInput,
  SituationUpdateInput,
  Story,
  StoryUpdateInput,
  Tag
} from '@shared/types'
import { getDb } from './index'
import { mediaUrlOrNull, now, type Row } from './util'

// ---------- stories ----------

export function listStories(): Story[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM stories ORDER BY order_index, id').all() as Row[]).map((r) => ({
    id: r.id as number,
    name: r.name as string,
    description: (r.description as string) ?? '',
    order_index: r.order_index as number,
    situation_count: (
      db.prepare('SELECT COUNT(*) AS n FROM situations WHERE story_id = ?').get(r.id) as { n: number }
    ).n,
    created_at: r.created_at as string
  }))
}

export function createStory(name: string): Story {
  const db = getDb()
  const max = (
    db.prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM stories').get() as { m: number }
  ).m
  const id = db
    .prepare('INSERT INTO stories (name, order_index) VALUES (?, ?)')
    .run(name.trim() || '新しいストーリー', max + 1).lastInsertRowid as number
  return listStories().find((s) => s.id === id)!
}

export function renameStory(id: number, patchOrName: string | StoryUpdateInput): Story {
  const name = typeof patchOrName === 'string' ? patchOrName : (patchOrName.name ?? '')
  getDb().prepare('UPDATE stories SET name = ? WHERE id = ?').run(name.trim(), id)
  return listStories().find((s) => s.id === id)!
}

export function updateStory(id: number, patch: StoryUpdateInput): Story {
  const db = getDb()
  if (patch.name !== undefined)
    db.prepare('UPDATE stories SET name = ? WHERE id = ?').run(patch.name.trim(), id)
  if (patch.description !== undefined)
    db.prepare('UPDATE stories SET description = ? WHERE id = ?').run(patch.description, id)
  return listStories().find((s) => s.id === id)!
}

// Resolve a story's name + description from a situation (for dialogue context).
export function storyForSituation(situationId: number): { name: string; description: string } | null {
  const r = getDb()
    .prepare(
      `SELECT st.name, st.description FROM situations s
       JOIN stories st ON st.id = s.story_id WHERE s.id = ?`
    )
    .get(situationId) as { name: string; description: string } | undefined
  return r ?? null
}

export function deleteStory(id: number): void {
  getDb().prepare('DELETE FROM stories WHERE id = ?').run(id)
}

export function reorderStories(ids: number[]): void {
  const db = getDb()
  const upd = db.prepare('UPDATE stories SET order_index = ? WHERE id = ?')
  db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))()
}

// ---------- situations ----------

function tagsForSituation(situationId: number): Tag[] {
  return getDb()
    .prepare(
      `SELECT t.id, t.name FROM situation_tag_defs t
       JOIN situation_tags st ON st.tag_id = t.id
       WHERE st.situation_id = ? ORDER BY t.name`
    )
    .all(situationId) as Tag[]
}

function toSituation(r: Row): Situation {
  const previewPath = (r.preview_image_path as string | null) ?? null
  return {
    id: r.id as number,
    story_id: r.story_id as number,
    name: r.name as string,
    prompt: r.prompt as string,
    negative_prompt: r.negative_prompt as string,
    aspect_ratio: r.aspect_ratio as AspectRatio,
    order_index: r.order_index as number,
    tags: tagsForSituation(r.id as number),
    dialogue_samples: (r.dialogue_samples as string) ?? '',
    preview_image_path: previewPath,
    preview_image_url: mediaUrlOrNull(previewPath),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string
  }
}

// ---------- situation tags (separate pool) ----------

export function listSituationTags(): Tag[] {
  return getDb().prepare('SELECT id, name FROM situation_tag_defs ORDER BY name').all() as Tag[]
}

export function createSituationTag(name: string): Tag {
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO situation_tag_defs (name) VALUES (?)').run(name.trim())
  return db.prepare('SELECT id, name FROM situation_tag_defs WHERE name = ?').get(name.trim()) as Tag
}

export function renameSituationTag(id: number, name: string): Tag {
  getDb().prepare('UPDATE situation_tag_defs SET name = ? WHERE id = ?').run(name.trim(), id)
  return getDb().prepare('SELECT id, name FROM situation_tag_defs WHERE id = ?').get(id) as Tag
}

export function deleteSituationTag(id: number): void {
  getDb().prepare('DELETE FROM situation_tag_defs WHERE id = ?').run(id)
}

export function setSituationPreviewPath(situationId: number, imagePath: string): Situation {
  getDb()
    .prepare('UPDATE situations SET preview_image_path = ?, updated_at = ? WHERE id = ?')
    .run(imagePath, now(), situationId)
  return getSituation(situationId)!
}

export function listSituationsByStory(storyId: number): Situation[] {
  return (
    getDb()
      .prepare('SELECT * FROM situations WHERE story_id = ? ORDER BY order_index, id')
      .all(storyId) as Row[]
  ).map(toSituation)
}

export function listAllSituations(): Situation[] {
  return (
    getDb()
      .prepare(
        `SELECT s.* FROM situations s JOIN stories st ON st.id = s.story_id
         ORDER BY st.order_index, st.id, s.order_index, s.id`
      )
      .all() as Row[]
  ).map(toSituation)
}

export function getSituation(id: number): Situation | null {
  const r = getDb().prepare('SELECT * FROM situations WHERE id = ?').get(id) as Row | undefined
  return r ? toSituation(r) : null
}

function setSituationTags(situationId: number, tagIds: number[]): void {
  const db = getDb()
  db.prepare('DELETE FROM situation_tags WHERE situation_id = ?').run(situationId)
  const ins = db.prepare('INSERT OR IGNORE INTO situation_tags (situation_id, tag_id) VALUES (?, ?)')
  for (const tid of tagIds) ins.run(situationId, tid)
}

export function createSituation(input: SituationCreateInput): Situation {
  const db = getDb()
  const max = (
    db
      .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM situations WHERE story_id = ?')
      .get(input.story_id) as { m: number }
  ).m
  const id = db
    .prepare(
      `INSERT INTO situations (story_id, name, prompt, negative_prompt, aspect_ratio, dialogue_samples, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.story_id,
      input.name ?? '',
      input.prompt ?? '',
      input.negative_prompt ?? '',
      input.aspect_ratio ?? 'portrait',
      input.dialogue_samples ?? '',
      max + 1
    ).lastInsertRowid as number
  if (input.tag_ids?.length) setSituationTags(id, input.tag_ids)
  return getSituation(id)!
}

export function updateSituation(id: number, input: SituationUpdateInput): Situation {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []
  const set = (col: string, val: unknown): void => {
    fields.push(`${col} = ?`)
    values.push(val)
  }
  if (input.story_id !== undefined) set('story_id', input.story_id)
  if (input.name !== undefined) set('name', input.name)
  if (input.prompt !== undefined) set('prompt', input.prompt)
  if (input.negative_prompt !== undefined) set('negative_prompt', input.negative_prompt)
  if (input.aspect_ratio !== undefined) set('aspect_ratio', input.aspect_ratio)
  if (input.dialogue_samples !== undefined) set('dialogue_samples', input.dialogue_samples)
  set('updated_at', now())
  values.push(id)
  db.prepare(`UPDATE situations SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  if (input.tag_ids !== undefined) setSituationTags(id, input.tag_ids)
  return getSituation(id)!
}

export function deleteSituation(id: number): void {
  getDb().prepare('DELETE FROM situations WHERE id = ?').run(id)
}

export function reorderSituations(storyId: number, ids: number[]): void {
  const db = getDb()
  const upd = db.prepare('UPDATE situations SET order_index = ? WHERE id = ? AND story_id = ?')
  db.transaction(() => ids.forEach((id, i) => upd.run(i, id, storyId)))()
}
