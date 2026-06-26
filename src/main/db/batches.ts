import type {
  Batch,
  BatchCreateInput,
  BatchStatus,
  BatchType,
  Generation,
  GenerationStatus,
  SceneBatchCreateInput
} from '@shared/types'
import { getDb } from './index'
import { now, mediaUrlOrNull, thumbUrlOrNull, type Row } from './util'
import { listSituationsByStory } from './situations'
import { deleteImage } from '../services/images'

function toGeneration(r: Row): Generation {
  const path = (r.image_path as string | null) ?? null
  return {
    id: r.id as number,
    batch_id: r.batch_id as number,
    situation_id: (r.situation_id as number | null) ?? null,
    character_id: (r.character_id as number | null) ?? null,
    seq: r.seq as number,
    situation_name: r.situation_name as string,
    character_name: (r.character_name as string) ?? '',
    dialogue: (r.dialogue as string) ?? '',
    image_path: path,
    image_url: mediaUrlOrNull(path),
    thumbnail_url: thumbUrlOrNull(path),
    status: r.status as GenerationStatus,
    error: (r.error as string | null) ?? null,
    has_original: !!(r.original_path as string | null),
    created_at: r.created_at as string
  }
}

function generationsForBatch(batchId: number): Generation[] {
  return (
    getDb()
      .prepare('SELECT * FROM generations WHERE batch_id = ? ORDER BY seq, id')
      .all(batchId) as Row[]
  ).map(toGeneration)
}

// Batches whose dialogue generation is running in the background (in-memory;
// drives renderer polling). Set by the dialogue worker.
const dialogueRunning = new Set<number>()
export function setDialogueRunning(id: number, on: boolean): void {
  if (on) dialogueRunning.add(id)
  else dialogueRunning.delete(id)
}

function toBatch(r: Row): Batch {
  const id = r.id as number
  const gens = generationsForBatch(id)
  return {
    id,
    name: r.name as string,
    type: (r.type as BatchType) ?? 'story',
    character_id: (r.character_id as number | null) ?? null,
    story_id: (r.story_id as number | null) ?? null,
    character_tag_id: (r.character_tag_id as number | null) ?? null,
    character_name: r.character_name as string,
    story_name: r.story_name as string,
    character_tag_name: (r.character_tag_name as string) ?? '',
    prefix_prompt: (r.prefix_prompt as string) ?? '',
    status: r.status as BatchStatus,
    total: r.total as number,
    done_count: gens.filter((g) => g.status !== 'pending').length,
    success_count: gens.filter((g) => g.status === 'success').length,
    dialogue_running: dialogueRunning.has(id),
    dialogue_count: gens.filter((g) => g.dialogue.trim().length > 0).length,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    generations: gens
  }
}

export function listBatches(): Batch[] {
  return (
    getDb()
      .prepare('SELECT * FROM batches ORDER BY datetime(created_at) DESC, id DESC')
      .all() as Row[]
  ).map(toBatch)
}

export function getBatch(id: number): Batch | null {
  const r = getDb().prepare('SELECT * FROM batches WHERE id = ?').get(id) as Row | undefined
  return r ? toBatch(r) : null
}

export function createBatch(input: BatchCreateInput): Batch {
  const db = getDb()
  const ch = db.prepare('SELECT id, name FROM characters WHERE id = ?').get(input.character_id) as
    | { id: number; name: string }
    | undefined
  if (!ch) throw new Error('キャラクターが見つかりません')
  const st = db.prepare('SELECT id, name FROM stories WHERE id = ?').get(input.story_id) as
    | { id: number; name: string }
    | undefined
  if (!st) throw new Error('ストーリーが見つかりません')

  const sits = listSituationsByStory(input.story_id)
  if (sits.length === 0) throw new Error('このストーリーにシチュエーションがありません')

  const name = (input.name?.trim() || `${ch.name}-${st.name}`).slice(0, 200)

  const tx = db.transaction(() => {
    const batchId = db
      .prepare(
        `INSERT INTO batches (name, type, character_id, story_id, character_name, story_name, prefix_prompt, status, total)
         VALUES (?, 'story', ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .run(name, ch.id, st.id, ch.name, st.name, input.prefix_prompt?.trim() ?? '', sits.length)
      .lastInsertRowid as number
    const ins = db.prepare(
      `INSERT INTO generations (batch_id, situation_id, character_id, seq, situation_name, character_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    sits.forEach((s, i) => ins.run(batchId, s.id, ch.id, i + 1, s.name, ch.name))
    return batchId
  })
  return getBatch(tx())!
}

// "scene" batch: selected situations × an explicit list of characters, one image
// each (situation-major order).
export function createSceneBatch(input: SceneBatchCreateInput): Batch {
  const db = getDb()
  const st = db.prepare('SELECT id, name FROM stories WHERE id = ?').get(input.story_id) as
    | { id: number; name: string }
    | undefined
  if (!st) throw new Error('ストーリーが見つかりません')

  const wanted = new Set(input.situation_ids)
  const sits = listSituationsByStory(input.story_id).filter((s) => wanted.has(s.id))
  if (sits.length === 0) throw new Error('シチュエーションが選択されていません')

  // Resolve the picked characters, preserving the selection order.
  const ids = [...new Set(input.character_ids)]
  const placeholders = ids.map(() => '?').join(',')
  const found = (
    ids.length
      ? (db.prepare(`SELECT id, name FROM characters WHERE id IN (${placeholders})`).all(...ids) as {
          id: number
          name: string
        }[])
      : []
  )
  const byId = new Map(found.map((c) => [c.id, c]))
  const chars = ids.map((id) => byId.get(id)).filter((c): c is { id: number; name: string } => !!c)
  if (chars.length === 0) throw new Error('キャラクターが選択されていません')

  const name = (input.name?.trim() || `${st.name} × ${chars.length}キャラ`).slice(0, 200)

  const tx = db.transaction(() => {
    const batchId = db
      .prepare(
        `INSERT INTO batches (name, type, story_id, story_name, prefix_prompt, status, total)
         VALUES (?, 'scene', ?, ?, ?, 'pending', ?)`
      )
      .run(name, st.id, st.name, input.prefix_prompt?.trim() ?? '', sits.length * chars.length)
      .lastInsertRowid as number
    const ins = db.prepare(
      `INSERT INTO generations (batch_id, situation_id, character_id, seq, situation_name, character_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    let seq = 1
    for (const s of sits) {
      for (const c of chars) ins.run(batchId, s.id, c.id, seq++, s.name, c.name)
    }
    return batchId
  })
  return getBatch(tx())!
}

export function deleteBatch(id: number): void {
  const db = getDb()
  const imgs = db
    .prepare('SELECT image_path FROM generations WHERE batch_id = ? AND image_path IS NOT NULL')
    .all(id) as { image_path: string }[]
  db.prepare('DELETE FROM batches WHERE id = ?').run(id)
  for (const { image_path } of imgs) deleteImage(image_path)
}

// ---------- worker-facing helpers ----------

export interface BatchRow {
  id: number
  name: string
  character_id: number | null
  prefix_prompt: string
  status: BatchStatus
}

export function getBatchRow(id: number): BatchRow | null {
  const r = getDb()
    .prepare('SELECT id, name, character_id, prefix_prompt, status FROM batches WHERE id = ?')
    .get(id) as BatchRow | undefined
  return r ?? null
}

export function setBatchStatus(id: number, status: BatchStatus): void {
  getDb().prepare('UPDATE batches SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
}

export interface PendingGeneration {
  id: number
  situation_id: number | null
  character_id: number | null
  seq: number
  situation_name: string
}

export function pendingGenerations(batchId: number): PendingGeneration[] {
  return getDb()
    .prepare(
      `SELECT id, situation_id, character_id, seq, situation_name FROM generations
       WHERE batch_id = ? AND status = 'pending' ORDER BY seq, id`
    )
    .all(batchId) as PendingGeneration[]
}

export function setGenerationResult(genId: number, imagePath: string): void {
  getDb()
    .prepare("UPDATE generations SET image_path = ?, status = 'success', error = NULL WHERE id = ?")
    .run(imagePath, genId)
}

export function setGenerationFailed(genId: number, error: string): void {
  getDb()
    .prepare("UPDATE generations SET status = 'failed', error = ? WHERE id = ?")
    .run(error.slice(0, 500), genId)
}

// Mark the batch completed/failed based on its generations' final states.
export function finalizeBatch(batchId: number): void {
  const db = getDb()
  const counts = db
    .prepare(
      `SELECT
         SUM(status = 'success') AS ok,
         SUM(status = 'failed') AS ng,
         SUM(status = 'pending') AS pend
       FROM generations WHERE batch_id = ?`
    )
    .get(batchId) as { ok: number; ng: number; pend: number }
  const status: BatchStatus = counts.pend > 0 ? 'processing' : counts.ok > 0 ? 'completed' : 'failed'
  setBatchStatus(batchId, status)
}

// success image paths in order — for ZIP download.
export function successImagePaths(batchId: number): string[] {
  return (
    getDb()
      .prepare(
        "SELECT image_path FROM generations WHERE batch_id = ? AND status = 'success' AND image_path IS NOT NULL ORDER BY seq, id"
      )
      .all(batchId) as { image_path: string }[]
  ).map((r) => r.image_path)
}

export function batchName(batchId: number): string | null {
  const r = getDb().prepare('SELECT name FROM batches WHERE id = ?').get(batchId) as
    | { name: string }
    | undefined
  return r?.name ?? null
}

// ---------- single generation (regenerate / mosaic) ----------

export interface GenerationRow {
  id: number
  batch_id: number
  situation_id: number | null
  character_id: number | null
  seq: number
  situation_name: string
  character_name: string
  image_path: string | null
  original_path: string | null
}

export function getGenerationRow(id: number): GenerationRow | null {
  const r = getDb()
    .prepare(
      'SELECT id, batch_id, situation_id, character_id, seq, situation_name, character_name, image_path, original_path FROM generations WHERE id = ?'
    )
    .get(id) as GenerationRow | undefined
  return r ?? null
}

export function setGenerationOriginalPath(id: number, originalPath: string): void {
  getDb().prepare('UPDATE generations SET original_path = ? WHERE id = ?').run(originalPath, id)
}

export function getGeneration(id: number): Generation | null {
  const r = getDb().prepare('SELECT * FROM generations WHERE id = ?').get(id) as Row | undefined
  return r ? toGeneration(r) : null
}

export function setDialogue(id: number, text: string): void {
  getDb().prepare('UPDATE generations SET dialogue = ? WHERE id = ?').run(text, id)
}

// Lines already assigned to OTHER images in the same batch — so a freshly
// generated line can avoid repeating them within the project.
export function dialoguesInBatch(batchId: number, excludeGenId: number): string[] {
  return (
    getDb()
      .prepare(
        "SELECT dialogue FROM generations WHERE batch_id = ? AND id != ? AND TRIM(dialogue) != ''"
      )
      .all(batchId, excludeGenId) as { dialogue: string }[]
  ).map((r) => r.dialogue)
}

// Success generations of a batch in order — for dialogue generation / posting.
export function successGenerationIds(batchId: number): number[] {
  return (
    getDb()
      .prepare("SELECT id FROM generations WHERE batch_id = ? AND status = 'success' ORDER BY seq, id")
      .all(batchId) as { id: number }[]
  ).map((r) => r.id)
}

// Replace a generation's image with a new file, deleting the old one.
export function setGenerationImage(id: number, newPath: string): void {
  const db = getDb()
  const old = (db.prepare('SELECT image_path FROM generations WHERE id = ?').get(id) as
    | { image_path: string | null }
    | undefined)?.image_path
  db.prepare("UPDATE generations SET image_path = ?, status = 'success', error = NULL WHERE id = ?").run(
    newPath,
    id
  )
  if (old && old !== newPath) deleteImage(old)
}
