import type {
  Character,
  CharacterCreateInput,
  CharacterImage,
  CharacterListItem,
  CharacterUpdateInput,
  ImageAddInput,
  ImageUpdateInput,
  PromptReplacement,
  Tag
} from '@shared/types'
import { REFERENCE_LIMIT } from '@shared/types'
import { getDb } from './index'
import { now, type Row } from './util'
import { decodeDataUrl, deleteImage, mediaUrl, saveImage, thumbKey } from '../services/images'
import { storagePathFor } from '../paths'
import { readFileSync } from 'fs'
import { posix } from 'path'

// ---------- serialization ----------

function parseReplacements(raw: string | null): PromptReplacement[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function toImage(row: Row): CharacterImage {
  const imagePath = row.image_path as string
  return {
    id: row.id as number,
    character_id: row.character_id as number,
    image_path: imagePath,
    image_url: mediaUrl(imagePath),
    thumbnail_url: mediaUrl(thumbKey(imagePath)),
    caption: (row.caption as string | null) ?? null,
    is_reference_enabled: !!row.is_reference_enabled,
    is_grayscale: !!row.is_grayscale,
    order_index: row.order_index as number,
    created_at: row.created_at as string
  }
}

function imagesForCharacter(characterId: number): CharacterImage[] {
  return (
    getDb()
      .prepare('SELECT * FROM character_images WHERE character_id = ? ORDER BY order_index, id')
      .all(characterId) as Row[]
  ).map(toImage)
}

function tagsForCharacter(characterId: number): Tag[] {
  return getDb()
    .prepare(
      `SELECT t.id, t.name FROM tags t JOIN character_tags ct ON ct.tag_id = t.id
       WHERE ct.character_id = ? ORDER BY t.name`
    )
    .all(characterId) as Tag[]
}

// ---------- characters ----------

export function listCharacters(): CharacterListItem[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM characters ORDER BY datetime(created_at) DESC, id DESC')
    .all() as Row[]
  return rows.map((r) => {
    const id = r.id as number
    const imageCount = (
      db.prepare('SELECT COUNT(*) AS n FROM character_images WHERE character_id = ?').get(id) as {
        n: number
      }
    ).n
    const thumb = db
      .prepare(
        `SELECT image_path FROM character_images WHERE character_id = ?
         ORDER BY is_reference_enabled DESC, order_index, id LIMIT 1`
      )
      .get(id) as { image_path: string } | undefined
    return {
      id,
      name: r.name as string,
      tags: tagsForCharacter(id),
      image_count: imageCount,
      thumbnail_url: thumb ? mediaUrl(thumbKey(thumb.image_path)) : null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string
    }
  })
}

export function getCharacter(id: number): Character | null {
  const r = getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id) as Row | undefined
  if (!r) return null
  return {
    id: r.id as number,
    name: r.name as string,
    prompt: r.prompt as string,
    negative_prompt: r.negative_prompt as string,
    prompt_replacements: parseReplacements(r.prompt_replacements as string),
    memo: r.memo as string,
    persona: (r.persona as string) ?? '',
    tags: tagsForCharacter(id),
    images: imagesForCharacter(id),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string
  }
}

function setCharacterTags(characterId: number, tagIds: number[]): void {
  const db = getDb()
  db.prepare('DELETE FROM character_tags WHERE character_id = ?').run(characterId)
  const ins = db.prepare('INSERT OR IGNORE INTO character_tags (character_id, tag_id) VALUES (?, ?)')
  for (const tid of tagIds) ins.run(characterId, tid)
}

export function createCharacter(input: CharacterCreateInput): Character {
  const db = getDb()
  const tx = db.transaction(() => {
    const id = db
      .prepare(
        `INSERT INTO characters (name, prompt, negative_prompt, prompt_replacements, memo, persona)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name.trim(),
        input.prompt ?? '',
        input.negative_prompt ?? '',
        JSON.stringify(input.prompt_replacements ?? []),
        input.memo ?? '',
        input.persona ?? ''
      ).lastInsertRowid as number
    if (input.tag_ids?.length) setCharacterTags(id, input.tag_ids)
    return id
  })
  return getCharacter(tx())!
}

export function updateCharacter(id: number, input: CharacterUpdateInput): Character {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []
  const set = (col: string, val: unknown): void => {
    fields.push(`${col} = ?`)
    values.push(val)
  }
  if (input.name !== undefined) set('name', input.name.trim())
  if (input.prompt !== undefined) set('prompt', input.prompt)
  if (input.negative_prompt !== undefined) set('negative_prompt', input.negative_prompt)
  if (input.prompt_replacements !== undefined)
    set('prompt_replacements', JSON.stringify(input.prompt_replacements))
  if (input.memo !== undefined) set('memo', input.memo)
  if (input.persona !== undefined) set('persona', input.persona)
  set('updated_at', now())
  values.push(id)
  db.prepare(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  if (input.tag_ids !== undefined) setCharacterTags(id, input.tag_ids)
  return getCharacter(id)!
}

export function deleteCharacter(id: number): void {
  const db = getDb()
  const imgs = db
    .prepare('SELECT image_path FROM character_images WHERE character_id = ?')
    .all(id) as { image_path: string }[]
  db.prepare('DELETE FROM characters WHERE id = ?').run(id)
  for (const { image_path } of imgs) deleteImage(image_path)
}

// ---------- character images ----------

function getImage(imageId: number): CharacterImage {
  return toImage(getDb().prepare('SELECT * FROM character_images WHERE id = ?').get(imageId) as Row)
}

export function addImages(input: ImageAddInput): CharacterImage[] {
  const db = getDb()
  const dir = posix.join('characters', String(input.character_id))
  const max = (
    db
      .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM character_images WHERE character_id = ?')
      .get(input.character_id) as { m: number }
  ).m
  const out: CharacterImage[] = []
  input.files.forEach((f, i) => {
    const { buf, ext } = decodeDataUrl(f.dataUrl)
    const key = saveImage(dir, buf, ext)
    const id = db
      .prepare('INSERT INTO character_images (character_id, image_path, order_index) VALUES (?, ?, ?)')
      .run(input.character_id, key, max + 1 + i).lastInsertRowid as number
    out.push(getImage(id))
  })
  return out
}

export function deleteCharacterImage(imageId: number): void {
  const db = getDb()
  const row = db.prepare('SELECT image_path FROM character_images WHERE id = ?').get(imageId) as
    | { image_path: string }
    | undefined
  db.prepare('DELETE FROM character_images WHERE id = ?').run(imageId)
  if (row) deleteImage(row.image_path)
}

export function updateCharacterImage(imageId: number, patch: ImageUpdateInput): CharacterImage {
  const db = getDb()
  if (patch.caption !== undefined)
    db.prepare('UPDATE character_images SET caption = ? WHERE id = ?').run(patch.caption, imageId)
  if (patch.is_grayscale !== undefined)
    db.prepare('UPDATE character_images SET is_grayscale = ? WHERE id = ?').run(patch.is_grayscale ? 1 : 0, imageId)
  return getImage(imageId)
}

export function toggleReference(imageId: number): CharacterImage {
  const db = getDb()
  const row = db
    .prepare('SELECT character_id, is_reference_enabled FROM character_images WHERE id = ?')
    .get(imageId) as { character_id: number; is_reference_enabled: number } | undefined
  if (!row) throw new Error('image not found')
  if (!row.is_reference_enabled) {
    const enabled = (
      db
        .prepare('SELECT COUNT(*) AS n FROM character_images WHERE character_id = ? AND is_reference_enabled = 1')
        .get(row.character_id) as { n: number }
    ).n
    if (enabled >= REFERENCE_LIMIT) throw new Error(`参照画像は最大 ${REFERENCE_LIMIT} 枚までです`)
  }
  db.prepare('UPDATE character_images SET is_reference_enabled = ? WHERE id = ?').run(
    row.is_reference_enabled ? 0 : 1,
    imageId
  )
  return getImage(imageId)
}

export function reorderCharacterImages(characterId: number, imageIds: number[]): void {
  const db = getDb()
  const upd = db.prepare('UPDATE character_images SET order_index = ? WHERE id = ? AND character_id = ?')
  db.transaction(() => imageIds.forEach((id, i) => upd.run(i, id, characterId)))()
}

export function saveImageFromPath(characterId: number, imagePath: string): CharacterImage {
  const buf = readFileSync(storagePathFor(imagePath))
  const ext = posix.extname(imagePath).replace('.', '') || 'png'
  const key = saveImage(posix.join('characters', String(characterId)), buf, ext)
  const db = getDb()
  const max = (
    db
      .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM character_images WHERE character_id = ?')
      .get(characterId) as { m: number }
  ).m
  const id = db
    .prepare('INSERT INTO character_images (character_id, image_path, order_index) VALUES (?, ?, ?)')
    .run(characterId, key, max + 1).lastInsertRowid as number
  return getImage(id)
}

// ---------- reference images (for generation) ----------

export interface RefImageRow {
  id: number
  image_path: string
  is_grayscale: boolean
  vibe_cache: string | null
}

export function referenceImagesForCharacter(characterId: number): RefImageRow[] {
  return (
    getDb()
      .prepare(
        `SELECT id, image_path, is_grayscale, vibe_cache FROM character_images
         WHERE character_id = ? AND is_reference_enabled = 1 ORDER BY order_index, id`
      )
      .all(characterId) as Row[]
  ).map((r) => ({
    id: r.id as number,
    image_path: r.image_path as string,
    is_grayscale: !!r.is_grayscale,
    vibe_cache: (r.vibe_cache as string | null) ?? null
  }))
}

export function updateVibeCache(imageId: number, vibe: string): void {
  getDb().prepare('UPDATE character_images SET vibe_cache = ? WHERE id = ?').run(vibe, imageId)
}

export interface RandomCharacter {
  id: number
  name: string
  prompt: string
  negative_prompt: string
  prompt_replacements: PromptReplacement[]
}

// Characters carrying a tag, by name — used for "scene × tag" batches.
export function charactersByTag(tagId: number): { id: number; name: string }[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.name FROM characters c
       JOIN character_tags ct ON ct.character_id = c.id
       WHERE ct.tag_id = ? ORDER BY c.name`
    )
    .all(tagId) as { id: number; name: string }[]
}

// One random registered character — used for situation test shots.
export function randomCharacter(): RandomCharacter | null {
  const r = getDb()
    .prepare('SELECT * FROM characters ORDER BY RANDOM() LIMIT 1')
    .get() as Row | undefined
  if (!r) return null
  return {
    id: r.id as number,
    name: r.name as string,
    prompt: r.prompt as string,
    negative_prompt: r.negative_prompt as string,
    prompt_replacements: parseReplacements(r.prompt_replacements as string)
  }
}

export function characterPrompt(characterId: number): { prompt: string; negative_prompt: string } {
  const r = getDb()
    .prepare('SELECT prompt, negative_prompt FROM characters WHERE id = ?')
    .get(characterId) as { prompt: string; negative_prompt: string } | undefined
  if (!r) throw new Error('character not found')
  return { prompt: r.prompt, negative_prompt: r.negative_prompt }
}

// ---------- tags ----------

export function listTags(): Tag[] {
  return getDb().prepare('SELECT id, name FROM tags ORDER BY name').all() as Tag[]
}

export function createTag(name: string): Tag {
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name.trim())
  return db.prepare('SELECT id, name FROM tags WHERE name = ?').get(name.trim()) as Tag
}

export function renameTag(id: number, name: string): Tag {
  getDb().prepare('UPDATE tags SET name = ? WHERE id = ?').run(name.trim(), id)
  return getDb().prepare('SELECT id, name FROM tags WHERE id = ?').get(id) as Tag
}

export function deleteTag(id: number): void {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

// ---------- settings ----------

export function getSetting(key: string): string | null {
  const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return r?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}
