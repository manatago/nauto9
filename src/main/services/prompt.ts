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
