import * as repo from '../db/repo'
import * as sit from '../db/situations'
import * as batches from '../db/batches'
import {
  DEFAULT_DIALOGUE_TEMPLATE,
  generateDialogue,
  type DialogueContext,
  type OllamaOptions
} from './ollama'
import { generateDialogueGrok } from './grok'
import { replaceXxx } from './prompt'

function ollamaOptions(): OllamaOptions {
  return {
    url: repo.getSetting('OLLAMA_URL') || 'http://localhost:11434',
    model: repo.getSetting('OLLAMA_MODEL') || '',
    template: repo.getSetting('DIALOGUE_PROMPT_TEMPLATE') || DEFAULT_DIALOGUE_TEMPLATE
  }
}

// Dispatch to the configured provider: local Ollama (default) or remote Grok.
function generateLine(ctx: DialogueContext): Promise<string> {
  if ((repo.getSetting('LLM_PROVIDER') || 'local').trim() === 'grok') {
    return generateDialogueGrok(ctx, {
      apiKey: repo.getSetting('GROK_API_KEY') || '',
      model: repo.getSetting('GROK_MODEL') || 'grok-4.3'
    })
  }
  return generateDialogue(ctx, ollamaOptions())
}

// Gather context for one generation (character + story + situation) and ask the
// local LLM for a line; persist it on the generation.
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
  // Per-situation example lines (newline-separated) → few-shot tone guidance.
  const samples = s.dialogue_samples
    .split('\n')
    .map((l) => replaceXxx(l.trim(), char.name))
    .filter((l) => l.length > 0)

  const line = await generateLine({
    character: char.name,
    traits,
    story: story?.name ?? '',
    storyDesc: story?.description ?? '',
    situation,
    samples
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
