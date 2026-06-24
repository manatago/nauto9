import * as repo from '../db/repo'
import * as sit from '../db/situations'
import * as batches from '../db/batches'
import { generateDialogueGrok } from './grok'
import { replaceXxx } from './prompt'

// Gather context for one generation (character + story + situation) and ask the
// LLM (Grok) for a line; persist it on the generation.
export async function generateDialogueForGeneration(genId: number): Promise<void> {
  const g = batches.getGenerationRow(genId)
  if (!g) throw new Error('生成が見つかりません')
  const char = g.character_id ? repo.getCharacter(g.character_id) : null
  const s = g.situation_id ? sit.getSituation(g.situation_id) : null
  if (!char) throw new Error('キャラクターが見つかりません（削除された可能性）')
  if (!s) throw new Error('シチュエーションが見つかりません（削除された可能性）')

  const story = sit.storyForSituation(s.id)
  // Personality/speech style drives the dialogue. The dedicated `persona` field
  // is best; fall back to memo, then the booru prompt only as a last resort.
  const traits = char.persona.trim() || char.memo.trim() || char.prompt.trim()
  // Likewise, feed the (ideally Japanese) situation NAME, not the English prompt.
  const situation = replaceXxx((s.name.trim() || s.prompt).trim(), char.name)
  // The English image prompt (pose/clothing/composition) as visual context — used
  // by capable remote models (Grok); the local model ignores it to avoid English bleed.
  const visual = replaceXxx(s.prompt.trim(), char.name)
  // Per-situation example lines (newline-separated) → few-shot tone guidance.
  const samples = s.dialogue_samples
    .split('\n')
    .map((l) => replaceXxx(l.trim(), char.name))
    .filter((l) => l.length > 0 && !/場面転換/.test(l)) // 場面転換 markers are for article chapters, not dialogue
  // Lines already used on other images in this batch — avoid repeating them.
  const avoid = batches.dialoguesInBatch(g.batch_id, genId)

  const line = await generateDialogueGrok({
    character: char.name,
    traits,
    story: story?.name ?? '',
    storyDesc: story?.description ?? '',
    situation,
    visual,
    samples,
    avoid
  })
  batches.setDialogue(genId, line)
}

// Background dialogue worker: generate a line for every success image of a
// batch, one at a time, writing each as it completes so the gallery can show
// progress. Per-image errors are logged and skipped (don't abort the batch).
const queue: number[] = []
let running = false

export function enqueueDialogues(batchId: number): void {
  if (!queue.includes(batchId)) {
    queue.push(batchId)
    batches.setDialogueRunning(batchId, true) // sync so an immediate refresh sees it
  }
  if (!running) void runWorker()
}

async function runWorker(): Promise<void> {
  running = true
  try {
    while (queue.length) {
      const batchId = queue.shift() as number
      try {
        for (const genId of batches.successGenerationIds(batchId)) {
          try {
            await generateDialogueForGeneration(genId)
          } catch (e) {
            console.error('[dialogue]', genId, (e as Error).message)
          }
        }
      } finally {
        batches.setDialogueRunning(batchId, false)
      }
    }
  } finally {
    running = false
  }
}
