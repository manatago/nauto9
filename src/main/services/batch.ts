import { posix } from 'path'
import * as batches from '../db/batches'
import * as repo from '../db/repo'
import * as sit from '../db/situations'
import type { RandomCharacter } from '../db/repo'
import type { Situation } from '@shared/types'
import { generateImage } from './novelai'
import { buildReferenceParams } from './reference'
import { saveImageWithName } from './images'
import { generationKey } from './naming'
import { applyCharacterReplacements, replaceXxx } from './prompt'

interface CharLike {
  id: number
  name: string
  prompt: string
  negative_prompt: string
  prompt_replacements: RandomCharacter['prompt_replacements']
}

// Generate one character × situation and save it under the nauto8 naming
// convention. Returns the saved logical key.
async function generateAndSave(
  batchName: string,
  char: CharLike,
  situation: Situation,
  seq: number,
  situationName: string,
  token: string
): Promise<string> {
  let scene = replaceXxx(situation.prompt, char.name)
  scene = applyCharacterReplacements(scene, char.prompt_replacements)
  const negative = [situation.negative_prompt, char.negative_prompt]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ')
  const ref = token ? await buildReferenceParams(char.id, scene, token) : undefined
  const png = await generateImage({
    token,
    charPrompt: char.prompt,
    scenePrompt: scene,
    negativePrompt: negative,
    aspect: situation.aspect_ratio,
    reference: ref?.params
  })
  const key = generationKey(batchName, seq, situationName)
  saveImageWithName(posix.dirname(key), posix.basename(key), png)
  return key
}

// Re-run a single generation (same character × situation, new random seed).
export async function regenerateGeneration(genId: number): Promise<void> {
  const g = batches.getGenerationRow(genId)
  if (!g) throw new Error('生成が見つかりません')
  const b = batches.getBatchRow(g.batch_id)
  if (!b) throw new Error('バッチが見つかりません')
  const char = g.character_id ? repo.getCharacter(g.character_id) : null
  const s = g.situation_id ? sit.getSituation(g.situation_id) : null
  if (!char) throw new Error('キャラクターが見つかりません（削除された可能性）')
  if (!s) throw new Error('シチュエーションが見つかりません（削除された可能性）')
  const token = repo.getSetting('NOVELAI_API_TOKEN') ?? ''
  const key = await generateAndSave(b.name, char, s, g.seq, g.situation_name, token)
  batches.setGenerationImage(genId, key)
}

// ---- sequential batch worker (NovelAI is rate-limited) ----
let running = false
const queue: number[] = []

export function enqueueBatch(id: number): void {
  if (!queue.includes(id)) queue.push(id)
  if (!running) void run()
}

async function run(): Promise<void> {
  running = true
  try {
    while (queue.length) {
      const id = queue.shift() as number
      try {
        await processBatch(id)
      } catch {
        batches.setBatchStatus(id, 'failed')
      }
    }
  } finally {
    running = false
  }
}

async function processBatch(batchId: number): Promise<void> {
  const b = batches.getBatchRow(batchId)
  if (!b) return
  batches.setBatchStatus(batchId, 'processing')
  const token = repo.getSetting('NOVELAI_API_TOKEN') ?? ''
  // Each generation carries its own character (scene batches mix characters);
  // cache loaded characters since scene batches reuse them across situations.
  const charCache = new Map<number, ReturnType<typeof repo.getCharacter>>()
  const charFor = (id: number | null): ReturnType<typeof repo.getCharacter> => {
    if (id == null) return null
    if (!charCache.has(id)) charCache.set(id, repo.getCharacter(id))
    return charCache.get(id) ?? null
  }

  for (const g of batches.pendingGenerations(batchId)) {
    try {
      const char = charFor(g.character_id)
      if (!char) throw new Error('キャラクターが見つかりません（削除された可能性）')
      const s = g.situation_id ? sit.getSituation(g.situation_id) : null
      if (!s) throw new Error('シチュエーションが見つかりません')
      const key = await generateAndSave(b.name, char, s, g.seq, g.situation_name, token)
      batches.setGenerationResult(g.id, key)
    } catch (e) {
      batches.setGenerationFailed(g.id, (e as Error).message)
    }
  }
  batches.finalizeBatch(batchId)
}
