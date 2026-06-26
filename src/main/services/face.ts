import { nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'
import { resourcePath } from '../paths'

// Anime face detector (deepghs/anime_face_detection v1.4-s, YOLOv8, ONNX). Same
// output layout as the censor detector — [1, 4+1, anchors] = cx,cy,w,h,score — so
// the decode mirrors censor.ts. We use it to aim a speech-bubble tail at the
// speaker's mouth (≈ lower-center of the face box).
const MODEL_FILE = 'face_detect_v1.4_s.onnx'
const SIZE = 640

export interface FaceBox {
  x0: number
  y0: number
  x1: number
  y1: number
  score: number
}

let sessionPromise: Promise<ort.InferenceSession> | null = null
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(resourcePath('models', MODEL_FILE))
  }
  return sessionPromise
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

export async function detectFaces(png: Buffer, conf = 0.25, iou = 0.6): Promise<FaceBox[]> {
  const img = nativeImage.createFromBuffer(png)
  const { width: ow, height: oh } = img.getSize()
  if (!ow || !oh) return []

  const bmp = img.resize({ width: SIZE, height: SIZE, quality: 'best' }).toBitmap() // BGRA
  const plane = SIZE * SIZE
  const data = new Float32Array(3 * plane)
  for (let p = 0; p < plane; p++) {
    data[p] = bmp[p * 4 + 2] / 255
    data[plane + p] = bmp[p * 4 + 1] / 255
    data[2 * plane + p] = bmp[p * 4] / 255
  }

  const session = await getSession()
  const result = await session.run({ images: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) })
  const out = result[session.outputNames[0]]
  const arr = out.data as Float32Array
  const n = out.dims[2] // anchors; dims = [1, 5, anchors]

  const cand: { box: number[]; score: number }[] = []
  for (let a = 0; a < n; a++) {
    const score = arr[4 * n + a]
    if (score <= conf) continue
    const cx = arr[a]
    const cy = arr[n + a]
    const w = arr[2 * n + a]
    const h = arr[3 * n + a]
    cand.push({ box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], score })
  }
  cand.sort((x, y) => y.score - x.score)
  const taken: typeof cand = []
  for (const c of cand) {
    if (taken.some((t) => iouOf(t.box, c.box) > iou)) continue
    taken.push(c)
  }

  const sx = ow / SIZE
  const sy = oh / SIZE
  return taken.map((c) => ({
    x0: c.box[0] * sx,
    y0: c.box[1] * sy,
    x1: c.box[2] * sx,
    y1: c.box[3] * sy,
    score: c.score
  }))
}
