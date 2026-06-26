import { nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'
import type { BubblePlacement } from '@shared/types'
import { resourcePath } from '../paths'
import { bestBackgroundBox } from './bubble-place'

// Lightweight foreground/background segmentation (rembg U²-Netp, ONNX, ~4.5MB).
// We don't cut the image out — we only need a ROUGH foreground map to find a
// background region where a dialogue bubble won't cover the subject/skin.
const MODEL_FILE = 'u2netp.onnx'
const SIZE = 320 // model input is a fixed 320×320 square
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let sessionPromise: Promise<ort.InferenceSession> | null = null
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(resourcePath('models', MODEL_FILE))
  }
  return sessionPromise
}

// Returns a 320×320 foreground-probability map (0 = background, 1 = subject).
async function foregroundMask(png: Buffer): Promise<Float32Array> {
  const img = nativeImage.createFromBuffer(png)
  const bmp = img.resize({ width: SIZE, height: SIZE, quality: 'best' }).toBitmap() // BGRA
  const plane = SIZE * SIZE
  const data = new Float32Array(3 * plane)
  for (let p = 0; p < plane; p++) {
    const r = bmp[p * 4 + 2] / 255
    const g = bmp[p * 4 + 1] / 255
    const b = bmp[p * 4] / 255
    data[p] = (r - MEAN[0]) / STD[0]
    data[plane + p] = (g - MEAN[1]) / STD[1]
    data[2 * plane + p] = (b - MEAN[2]) / STD[2]
  }
  const session = await getSession()
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) })
  const m = out[session.outputNames[0]].data as Float32Array // [1,1,320,320]

  // rembg-style min-max normalize to 0..1.
  let mi = Infinity
  let ma = -Infinity
  for (let i = 0; i < plane; i++) {
    if (m[i] < mi) mi = m[i]
    if (m[i] > ma) ma = m[i]
  }
  const range = ma - mi || 1
  const fg = new Float32Array(plane)
  for (let i = 0; i < plane; i++) fg[i] = (m[i] - mi) / range
  return fg
}

// Find where a (boxW × boxH) bubble best fits on the background of this image.
export async function placeBubble(png: Buffer, boxW: number, boxH: number): Promise<BubblePlacement> {
  const img = nativeImage.createFromBuffer(png)
  const { width: W, height: H } = img.getSize()
  if (!W || !H) throw new Error('画像の読み込みに失敗しました')

  const fg = await foregroundMask(png)
  const best = bestBackgroundBox(fg, SIZE, SIZE, (boxW * SIZE) / W, (boxH * SIZE) / H)

  // Foreground centroid (mask space → image px) for the tail target.
  let sx = 0
  let sy = 0
  let sw = 0
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      if (fg[j * SIZE + i] > 0.5) {
        sx += i
        sy += j
        sw += 1
      }
    }
  }
  const cxMask = sw ? sx / sw : SIZE / 2
  const cyMask = sw ? sy / sw : SIZE / 2

  return {
    x: Math.round((best.x * W) / SIZE),
    y: Math.round((best.y * H) / SIZE),
    found: best.meanFg < 0.2, // mostly-background box available
    tailX: Math.round((cxMask * W) / SIZE),
    tailY: Math.round((cyMask * H) / SIZE)
  }
}
