// Pure helpers for the Grok dialogue path (no IO) — output cleanup and scene
// classification. Separated so they're unit-testable.
import type { DialogueContext } from './dialogue-types'

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
// gated on the mouth being closed. Mouth state prefers the IMAGE-detected tags
// (emotion) over the prompt text when available.
export function classifyScene(
  ctx: Pick<DialogueContext, 'situation' | 'samples' | 'visual' | 'emotion' | 'act'>
): SceneFlags {
  const sceneText = [ctx.situation, ...ctx.samples].join(' ')
  const emo = (ctx.emotion ?? []).map((e) => e.tag)
  const act = (ctx.act ?? []).map((e) => e.tag)
  const open = ['open_mouth', ':d', ':o', 'tongue_out'].some((t) => emo.includes(t))
  const closedMouth = emo.length
    ? emo.includes('closed_mouth') && !open
    : /closed[\s_]?mouth/i.test(ctx.visual)
  // Mouth occupied (→ inner monologue / muffled): kissing, or an oral act she's giving.
  const mouthBusyAct = ['fellatio', 'deepthroat', 'irrumatio'].some((t) => act.includes(t))
  return {
    wantsInner: /心の声|内心|心の中|モノローグ|独白/.test(sceneText),
    kissing: mouthBusyAct || /kiss/i.test(ctx.visual) || /キス|接吻/.test(sceneText),
    closedMouth
  }
}
