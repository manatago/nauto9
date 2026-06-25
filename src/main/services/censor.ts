import { nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'
import { resourcePath } from '../paths'
import type { CensorBox, CensorLabel } from '@shared/types'

// Anime NSFW part detector (deepghs/anime_censor_detection, YOLOv8-s, ONNX).
// Returns boxes for genitals so we can suggest mosaic regions. Breasts/nipples
// are intentionally NOT mosaicked here (only penis + pussy by default).
const MODEL_FILE = 'censor_detect_v1.0_s.onnx'
const SIZE = 1216 // model input is a fixed SIZE×SIZE square (aspect ignored)
const LABELS: CensorLabel[] = ['nipple_f', 'penis', 'pussy'] // class order in the model

let sessionPromise: Promise<ort.InferenceSession> | null = null
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(resourcePath('models', MODEL_FILE))
  }
  return sessionPromise
}

export interface DetectOptions {
  conf?: number // confidence threshold (default 0.3); lower catches more
  iou?: number // NMS IoU threshold (default 0.7)
  classes?: CensorLabel[] // which classes to keep (default genitals only)
  pad?: number // grow each box by this fraction of its size (default 0.1)
}

function iouOf(a: number[], b: number[]): number {
  const xx1 = Math.max(a[0], b[0])
  const yy1 = Math.max(a[1], b[1])
  const xx2 = Math.min(a[2], b[2])
  const yy2 = Math.min(a[3], b[3])
  const inter = Math.max(0, xx2 - xx1) * Math.max(0, yy2 - yy1)
  const areaA = (a[2] - a[0]) * (a[3] - a[1])
  const areaB = (b[2] - b[0]) * (b[3] - b[1])
  return inter / (areaA + areaB - inter || 1)
}

export async function detectCensors(png: Buffer, opts: DetectOptions = {}): Promise<CensorBox[]> {
  const conf = opts.conf ?? 0.1 // aggressive recall — miss as few genitals as possible
  const iou = opts.iou ?? 0.7
  const keep = opts.classes ?? ['penis', 'pussy']
  const pad = opts.pad ?? 0.4 // grow each box 40%/side for fuller coverage

  const img = nativeImage.createFromBuffer(png)
  const { width: ow, height: oh } = img.getSize()
  if (!ow || !oh) throw new Error('画像の読み込みに失敗しました')

  // preprocess: resize to SIZE×SIZE, then BGRA bitmap -> RGB CHW float /255
  const bmp = img.resize({ width: SIZE, height: SIZE, quality: 'best' }).toBitmap()
  const plane = SIZE * SIZE
  const data = new Float32Array(3 * plane)
  for (let p = 0; p < plane; p++) {
    data[p] = bmp[p * 4 + 2] / 255 // R
    data[plane + p] = bmp[p * 4 + 1] / 255 // G
    data[2 * plane + p] = bmp[p * 4] / 255 // B
  }

  const session = await getSession()
  const result = await session.run({ images: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) })
  const out = result[session.outputNames[0]]
  const arr = out.data as Float32Array
  const n = out.dims[2] // anchors; dims = [1, 4+classes, anchors]
  const nc = LABELS.length

  // decode YOLOv8 output: rows 0-3 = cx,cy,w,h ; rows 4.. = per-class scores
  const cand: { box: number[]; label: CensorLabel; score: number }[] = []
  for (let a = 0; a < n; a++) {
    let best = 0
    let bestScore = 0
    for (let c = 0; c < nc; c++) {
      const s = arr[(4 + c) * n + a]
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    if (bestScore <= conf || !keep.includes(LABELS[best])) continue
    const cx = arr[a]
    const cy = arr[n + a]
    const w = arr[2 * n + a]
    const h = arr[3 * n + a]
    cand.push({
      box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
      label: LABELS[best],
      score: bestScore
    })
  }

  // class-agnostic NMS
  cand.sort((x, y) => y.score - x.score)
  const taken: typeof cand = []
  for (const c of cand) {
    if (taken.some((t) => iouOf(t.box, c.box) > iou)) continue
    taken.push(c)
  }

  // scale back to the original image, pad, clamp
  const sx = ow / SIZE
  const sy = oh / SIZE
  return taken.map((c) => {
    const x0 = c.box[0] * sx
    const y0 = c.box[1] * sy
    const x1 = c.box[2] * sx
    const y1 = c.box[3] * sy
    const pw = (x1 - x0) * pad
    const ph = (y1 - y0) * pad
    return {
      x0: Math.max(0, Math.round(x0 - pw)),
      y0: Math.max(0, Math.round(y0 - ph)),
      x1: Math.min(ow, Math.round(x1 + pw)),
      y1: Math.min(oh, Math.round(y1 + ph)),
      label: c.label,
      score: c.score
    }
  })
}
