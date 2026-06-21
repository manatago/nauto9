import { unzipSync } from 'fflate'
import { nativeImage } from 'electron'

const GENERATE_URL = 'https://image.novelai.net/ai/generate-image'
const ENCODE_VIBE_URL = 'https://image.novelai.net/ai/encode-vibe'
const SUBSCRIPTION_URL = 'https://api.novelai.net/user/subscription'
const MODEL = 'nai-diffusion-4-5-full'

export const DEFAULT_NEGATIVE =
  'nsfw, lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, ' +
  'bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, ' +
  'extra digits, artistic error, username, scan, [abstract]'

const QUALITY_PREFIX = 'best quality, amazing quality, very aesthetic, '

export const ASPECT_MAP = {
  portrait: { width: 832, height: 1216 },
  square: { width: 1024, height: 1024 },
  landscape: { width: 1216, height: 832 }
} as const

export type Aspect = keyof typeof ASPECT_MAP

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Origin: 'https://novelai.net',
    Referer: 'https://novelai.net/'
  }
}

// Remaining Anlas (fixed + purchased training steps) for the account.
export async function getAnlas(token: string): Promise<number> {
  if (!token.trim()) throw new Error('NovelAI トークンが未設定です（設定画面で入力してください）')
  const res = await fetch(SUBSCRIPTION_URL, { headers: headers(token) })
  if (res.status === 401) throw new Error('NovelAI トークンが無効です（401）')
  if (!res.ok) throw new Error(`NovelAI HTTP ${res.status}`)
  const data = (await res.json()) as {
    trainingStepsLeft?: { fixedTrainingStepsLeft?: number; purchasedTrainingStepsLeft?: number }
  }
  const t = data.trainingStepsLeft ?? {}
  return (t.fixedTrainingStepsLeft ?? 0) + (t.purchasedTrainingStepsLeft ?? 0)
}

// Faithful port of nauto8 build_v45_params: scene goes in base_caption,
// the character description goes in char_captions.
function buildParams(
  width: number,
  height: number,
  scenePrompt: string,
  negative: string,
  charPrompt: string,
  seed: number
): Record<string, unknown> {
  const baseCaption = `${QUALITY_PREFIX}${scenePrompt}`.replace(/,\s*$/, '')
  const fullInput = charPrompt ? `${baseCaption}, ${charPrompt}` : baseCaption
  const neg = negative || DEFAULT_NEGATIVE
  return {
    width,
    height,
    scale: 6.0,
    sampler: 'k_euler_ancestral',
    steps: 28,
    n_samples: 1,
    ucPreset: 0,
    qualityToggle: true,
    dynamic_thresholding: false,
    controlnet_strength: 1.0,
    legacy: false,
    add_original_image: false,
    cfg_rescale: 0,
    noise_schedule: 'karras',
    legacy_v3_extend: false,
    skip_cfg_above_sigma: null,
    params_version: 3,
    seed,
    input: fullInput,
    negative_prompt: neg,
    v4_prompt: {
      caption: {
        base_caption: baseCaption,
        char_captions: [{ char_caption: charPrompt, centers: [{ x: 0.5, y: 0.5 }] }]
      },
      use_coords: false,
      use_order: true
    },
    v4_negative_prompt: {
      caption: {
        base_caption: neg,
        char_captions: [{ char_caption: '', centers: [{ x: 0.5, y: 0.5 }] }]
      },
      use_coords: false,
      use_order: false,
      legacy_uc: false
    },
    characterPrompts: [{ prompt: charPrompt, uc: '', center: { x: 0.5, y: 0.5 }, enabled: true }],
    deliberate_euler_ancestral_bug: false,
    prefer_brownian: true,
    action: 'generate'
  }
}

function extractPng(zipBytes: Uint8Array): Buffer | null {
  const files = unzipSync(zipBytes)
  for (const name of Object.keys(files)) {
    if (name.toLowerCase().endsWith('.png')) return Buffer.from(files[name])
  }
  return null
}

// ---- reference image support (Vibe Transfer / Precise Director Reference) ----

// Encode an image into a NovelAI "vibe" blob (base64) via the encode-vibe API.
// The result is cached and reused as reference_image_multiple entries.
export async function encodeVibe(token: string, png: Buffer): Promise<string> {
  const res = await fetch(ENCODE_VIBE_URL, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ image: png.toString('base64'), model: MODEL })
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`encode-vibe HTTP ${res.status}: ${t.slice(0, 150)}`)
  }
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

// Aspect-preserving resize into 1024x1536 with black padding, returned as PNG
// base64 — the input format NovelAI V4.5 Precise Reference expects. Uses
// Electron nativeImage bitmap compositing (BGRA) to avoid extra native deps.
export function cropPadTo1024x1536Base64(png: Buffer): string {
  const TW = 1024
  const TH = 1536
  const img = nativeImage.createFromBuffer(png)
  const { width: sw, height: sh } = img.getSize()
  if (!sw || !sh) throw new Error('画像の読み込みに失敗しました')
  const srcRatio = sw / sh
  const targetRatio = TW / TH
  let nw: number
  let nh: number
  if (srcRatio > targetRatio) {
    nw = TW
    nh = Math.max(1, Math.round(TW / srcRatio))
  } else {
    nh = TH
    nw = Math.max(1, Math.round(TH * srcRatio))
  }
  const bmp = img.resize({ width: nw, height: nh, quality: 'best' }).toBitmap() // BGRA, nw*nh*4
  const canvas = Buffer.alloc(TW * TH * 4)
  for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255 // opaque black background
  const offX = Math.floor((TW - nw) / 2)
  const offY = Math.floor((TH - nh) / 2)
  const rowBytes = nw * 4
  for (let y = 0; y < nh; y++) {
    const src = y * rowBytes
    const dst = ((offY + y) * TW + offX) * 4
    bmp.copy(canvas, dst, src, src + rowBytes)
  }
  return nativeImage.createFromBitmap(canvas, { width: TW, height: TH }).toPNG().toString('base64')
}

export function buildVibeParams(
  vibes: string[],
  infoExtracted: number,
  strength: number
): Record<string, unknown> {
  const n = vibes.length
  return {
    reference_image_multiple: vibes,
    reference_information_extracted_multiple: Array(n).fill(infoExtracted),
    reference_strength_multiple: Array(n).fill(strength),
    reference_indices_multiple: vibes.map((_, i) => i),
    normalize_reference_strength_multiple: true
  }
}

export type PreciseRefType = 'character' | 'style' | 'character&style'

export function buildPreciseParams(
  pngsB64: string[],
  strength: number,
  fidelity: number,
  refType: PreciseRefType
): Record<string, unknown> {
  const n = pngsB64.length
  const round2 = (x: number): number => Math.round(x * 100) / 100
  return {
    director_reference_images: pngsB64,
    director_reference_descriptions: pngsB64.map(() => ({
      caption: { base_caption: refType, char_captions: [] },
      legacy_uc: false
    })),
    director_reference_strength_values: Array(n).fill(round2(strength)),
    director_reference_secondary_strength_values: Array(n).fill(round2(1.0 - fidelity)),
    director_reference_information_extracted: Array(n).fill(1.0),
    normalize_reference_strength_multiple: false
  }
}

export interface GenerateOptions {
  token: string
  charPrompt: string
  negativePrompt?: string
  scenePrompt?: string
  aspect?: Aspect
  seed?: number
  // Extra params merged into the request (vibe or precise reference block).
  reference?: Record<string, unknown>
}

// Generate a single PNG. Retries on 429/5xx like nauto8.
export async function generateImage(opts: GenerateOptions): Promise<Buffer> {
  if (!opts.token) throw new Error('NovelAI トークンが設定されていません（設定画面で入力してください）')
  const { width, height } = ASPECT_MAP[opts.aspect ?? 'portrait']
  const seed = opts.seed ?? Math.floor(Math.random() * (2 ** 31 - 1))
  const params = buildParams(
    width,
    height,
    opts.scenePrompt ?? '',
    opts.negativePrompt ?? '',
    opts.charPrompt,
    seed
  )
  if (opts.reference) Object.assign(params, opts.reference)
  const payload = JSON.stringify({ model: MODEL, parameters: params })

  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: headers(opts.token),
        body: payload
      })
      if (res.status === 402) throw new Error('Anlas が不足しています (402)')
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`NovelAI HTTP ${res.status}`)
        await sleep(2 ** attempt * 1000)
        continue
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`NovelAI HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      const png = extractPng(buf)
      if (!png) throw new Error('応答 ZIP に PNG が見つかりません')
      return png
    } catch (e) {
      lastErr = e as Error
      // 402 and explicit HTTP errors should not be retried silently forever,
      // but mirror nauto8's behaviour of retrying transient failures.
      if (/Anlas/.test(lastErr.message)) throw lastErr
      await sleep((attempt + 1) * 1000)
    }
  }
  throw lastErr ?? new Error('生成に失敗しました')
}
