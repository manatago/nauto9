import type { PromptReplacement } from '@shared/types'

export function isMonochromePrompt(text: string): boolean {
  return /monochrome|greyscale|grayscale|monotone/i.test(text)
}

// ---- helpers ported from nauto8 prompt_cleaning.py.
// Reserved for situation-based generation (applying a character's
// prompt_replacements / xxx substitution); not wired into preview yet. ----

export function replaceXxx(situationPrompt: string, characterName: string): string {
  return situationPrompt.split('xxx').join(characterName)
}

// A color/appearance eye tag (e.g. "green eyes", "dark blue eyes", "heterochromia")
// forces the eyes open. When the scene asks for closed eyes, drop those tags from
// the character prompt so the eyes actually close. State tags ("closed eyes",
// "wide eyes", etc.) are kept.
const EYE_COLOR_RE =
  /\b(?:red|orange|yellow|green|blue|aqua|cyan|teal|purple|violet|pink|brown|black|white|grey|gray|amber|gold|golden|silver|hazel|crimson|emerald|turquoise|magenta)\b/i

export function stripEyeColorIfClosed(charPrompt: string, scenePrompt: string): string {
  if (!/\bclosed eyes\b|\beyes closed\b/i.test(scenePrompt)) return charPrompt
  return charPrompt
    .split(',')
    .map((t) => t.trim())
    .filter((t) => {
      if (/heterochromia/i.test(t)) return false // two-color eyes — remove (even standalone)
      if (!/\beyes\b/i.test(t)) return true // not an eye tag — keep
      return !EYE_COLOR_RE.test(t) // "<color> eyes" — remove; state tags stay
    })
    .filter(Boolean)
    .join(', ')
}

const GIRL_RE = /\bgirl(s?)\b/gi

// If the character is "a boy", flip girl/girls -> boy/boys in the situation text.
// Word-boundary match keeps "cowboy" safe.
export function adaptForBoy(situationPrompt: string, characterPrompt: string): string {
  if (!/\ba boy\b/i.test(characterPrompt)) return situationPrompt
  return situationPrompt.replace(GIRL_RE, (_m, s) => 'boy' + s)
}

// Literal, case-insensitive, in-order substring replacements. Empty `replace`
// removes the matched phrase.
export function applyCharacterReplacements(
  text: string,
  replacements: PromptReplacement[] | null | undefined
): string {
  if (!replacements?.length) return text
  let out = text
  for (const { find, replace } of replacements) {
    if (!find) continue
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    out = out.replace(re, replace ?? '')
  }
  return out
}
