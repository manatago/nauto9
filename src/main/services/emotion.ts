import { nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'
import { createWriteStream, existsSync, readFileSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import type { EmotionTag } from '@shared/types'
import { modelCacheDir } from '../paths'

// Anime expression/emotion read via the WaifuDiffusion v1.4 tagger (SmilingWolf,
// moat-v2, ONNX). Danbooru-trained → handles NSFW locally, no upload. The model
// is ~310MB so it is NOT bundled: it's downloaded to the model cache on first use.
const MODEL_URL = 'https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger-v2/resolve/main/model.onnx'
const TAGS_URL = 'https://huggingface.co/SmilingWolf/wd-v1-4-moat-tagger-v2/resolve/main/selected_tags.csv'
const SIZE = 448 // model input is 448×448, NHWC, BGR, 0-255 (no normalization)
const THRESHOLD = 0.35

// Curated Danbooru expression tags → Japanese label. Only these are surfaced.
const EMO: Record<string, string> = {
  smile: '笑顔',
  grin: 'にやり',
  ':d': '満面の笑み',
  ':3': 'にこ',
  laughing: '大笑い',
  happy: '嬉しい',
  blush: '赤面',
  embarrassed: '照れ',
  nervous: '緊張',
  flying_sweatdrops: '焦り',
  nervous_sweating: '冷や汗',
  crying: '泣き',
  tears: '涙',
  crying_with_eyes_open: '泣き(目開)',
  streaming_tears: '号泣',
  tearing_up: '涙ぐむ',
  sad: '悲しい',
  angry: '怒り',
  annoyed: '苛立ち',
  scowl: 'しかめ面',
  pout: 'むくれ',
  clenched_teeth: '歯噛み',
  surprised: '驚き',
  shocked: '衝撃',
  'wide-eyed': '目を見開く',
  scared: '怯え',
  fear: '恐怖',
  serious: '真剣',
  expressionless: '無表情',
  closed_eyes: '目閉じ',
  'half-closed_eyes': 'とろん目',
  bedroom_eyes: '流し目',
  seductive_smile: '妖艶な笑み',
  naughty_face: 'いたずら顔',
  ahegao: 'アヘ顔',
  torogao: 'とろ顔',
  drooling: 'よだれ',
  saliva: '唾液',
  tongue_out: '舌出し',
  heavy_breathing: '息荒い',
  smirk: 'にやけ',
  evil_smile: '悪い笑み',
  open_mouth: '口開け',
  parted_lips: '唇を開く',
  one_eye_closed: 'ウインク',
  wink: 'ウインク'
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`モデルのダウンロードに失敗しました (${res.status})`)
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest))
}

interface Ready {
  session: ort.InferenceSession
  emo: { index: number; tag: string; label: string }[]
}
let readyPromise: Promise<Ready> | null = null

function parseTags(csvPath: string): { index: number; tag: string; label: string }[] {
  const rows = readFileSync(csvPath, 'utf8').split('\n')
  const out: { index: number; tag: string; label: string }[] = []
  // Row 0 is the header; data row i maps to model output index i.
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(',')
    if (cols.length < 3) continue
    const name = cols[1]
    const category = cols[2]
    if (category === '0' && EMO[name]) out.push({ index: i - 1, tag: name, label: EMO[name] })
  }
  return out
}

async function init(): Promise<Ready> {
  const model = join(modelCacheDir(), 'wd14-moat.onnx')
  const tags = join(modelCacheDir(), 'wd14-tags.csv')
  if (!existsSync(tags)) await download(TAGS_URL, tags)
  if (!existsSync(model)) await download(MODEL_URL, model)
  const session = await ort.InferenceSession.create(model)
  return { session, emo: parseTags(tags) }
}
function getReady(): Promise<Ready> {
  if (!readyPromise) readyPromise = init()
  return readyPromise
}

// Pad to a white square, resize to 448, BGR NHWC float 0-255 (WD14 preprocessing).
function preprocess(png: Buffer): Float32Array {
  const img = nativeImage.createFromBuffer(png)
  const { width: ow, height: oh } = img.getSize()
  if (!ow || !oh) throw new Error('画像の読み込みに失敗しました')
  const scale = SIZE / Math.max(ow, oh)
  const nw = Math.max(1, Math.round(ow * scale))
  const nh = Math.max(1, Math.round(oh * scale))
  const bmp = img.resize({ width: nw, height: nh, quality: 'best' }).toBitmap() // BGRA
  const data = new Float32Array(SIZE * SIZE * 3).fill(255) // white background
  const ox = Math.floor((SIZE - nw) / 2)
  const oy = Math.floor((SIZE - nh) / 2)
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const s = (y * nw + x) * 4
      const d = ((oy + y) * SIZE + (ox + x)) * 3
      data[d] = bmp[s] // B
      data[d + 1] = bmp[s + 1] // G
      data[d + 2] = bmp[s + 2] // R
    }
  }
  return data
}

export async function detectEmotion(png: Buffer): Promise<EmotionTag[]> {
  const { session, emo } = await getReady()
  const input = new ort.Tensor('float32', preprocess(png), [1, SIZE, SIZE, 3])
  const result = await session.run({ [session.inputNames[0]]: input })
  const probs = result[session.outputNames[0]].data as Float32Array
  return emo
    .map((e) => ({ tag: e.tag, label: e.label, score: probs[e.index] }))
    .filter((r) => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}
