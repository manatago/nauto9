import { existsSync, readFileSync } from 'fs'
import { storagePathFor } from '../paths'
import * as repo from '../db/repo'
import {
  buildPreciseParams,
  buildVibeParams,
  cropPadTo1024x1536Base64,
  encodeVibe,
  type PreciseRefType
} from './novelai'
import { isMonochromePrompt } from './prompt'

export type ReferenceMode = 'none' | 'vibe' | 'precise'

export const REFERENCE_DEFAULTS = {
  REFERENCE_MODE: 'vibe',
  VIBE_INFORMATION_EXTRACTED: '0.6',
  VIBE_REFERENCE_STRENGTH: '0.45',
  CR_REFERENCE_STRENGTH: '0.7',
  CR_FIDELITY: '0.7',
  CR_TYPE: 'character'
} as const

function num(key: string, fallback: number): number {
  const v = parseFloat(repo.getSetting(key) ?? '')
  return Number.isNaN(v) ? fallback : v
}

export function referenceMode(): ReferenceMode {
  const m = (repo.getSetting('REFERENCE_MODE') ?? REFERENCE_DEFAULTS.REFERENCE_MODE).toLowerCase()
  return m === 'precise' || m === 'none' ? (m as ReferenceMode) : 'vibe'
}

export interface ReferenceBuild {
  params?: Record<string, unknown>
  mode: ReferenceMode
  count: number // how many reference images were actually applied
}

// Build the reference parameter block for a character's reference-enabled
// images, according to the active mode. `count` = how many were applied.
export async function buildReferenceParams(
  characterId: number,
  resolvedPrompt: string,
  token: string
): Promise<ReferenceBuild> {
  const mode = referenceMode()
  if (mode === 'none') return { mode, count: 0 }

  let imgs = repo.referenceImagesForCharacter(characterId)
  // Monochrome prompts only take grayscale references (nauto8 rule).
  if (isMonochromePrompt(resolvedPrompt)) imgs = imgs.filter((i) => i.is_grayscale)
  imgs = imgs.filter((i) => existsSync(storagePathFor(i.image_path)))
  if (!imgs.length) return { mode, count: 0 }

  if (mode === 'precise') {
    const pngs = imgs.map((i) => cropPadTo1024x1536Base64(readFileSync(storagePathFor(i.image_path))))
    const type = (repo.getSetting('CR_TYPE') || REFERENCE_DEFAULTS.CR_TYPE) as PreciseRefType
    const params = buildPreciseParams(pngs, num('CR_REFERENCE_STRENGTH', 0.7), num('CR_FIDELITY', 0.7), type)
    return { params, mode, count: pngs.length }
  }

  // vibe: lazily encode + cache each image's vibe blob
  const vibes: string[] = []
  for (const i of imgs) {
    let vibe = i.vibe_cache
    if (!vibe) {
      vibe = await encodeVibe(token, readFileSync(storagePathFor(i.image_path)))
      repo.updateVibeCache(i.id, vibe)
    }
    vibes.push(vibe)
  }
  const params = buildVibeParams(
    vibes,
    num('VIBE_INFORMATION_EXTRACTED', 0.6),
    num('VIBE_REFERENCE_STRENGTH', 0.45)
  )
  return { params, mode, count: vibes.length }
}
