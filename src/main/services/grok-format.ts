// Pure helpers for the Grok dialogue path (no IO) — output cleanup and scene
// classification. Separated so they're unit-testable.
import type { DialogueContext } from './ollama'

export function cleanGrokLine(s: string): string {
  const out = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const line = out.match(/[「『]([^」』]+)[」』]/)
    ? (out.match(/[「『]([^」』]+)[」』]/) as RegExpMatchArray)[1]
    : (out.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '')
  // Keep full-width （）— they mark an inner-monologue line (closed-mouth, non-sex
  // scene). Only strip stray quote marks.
  return line.replace(/^[「『"']+/, '').replace(/[」』"']+$/, '').trim()
}

export interface SceneFlags {
  wantsInner: boolean // the situation explicitly asks for inner monologue
  kissing: boolean // mouth busy → inner monologue
  closedMouth: boolean // image tagged closed mouth
}

// Decide the dialogue output mode from the scene/visual context. Inner monologue
// when she isn't speaking aloud (explicit request, kissing); moans vs words is
// gated on the mouth being closed.
export function classifyScene(
  ctx: Pick<DialogueContext, 'situation' | 'samples' | 'visual'>
): SceneFlags {
  const sceneText = [ctx.situation, ...ctx.samples].join(' ')
  return {
    wantsInner: /心の声|内心|心の中|モノローグ|独白/.test(sceneText),
    kissing: /kiss/i.test(ctx.visual) || /キス|接吻/.test(sceneText),
    closedMouth: /closed[\s_]?mouth/i.test(ctx.visual)
  }
}
