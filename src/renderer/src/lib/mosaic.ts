import { api } from '../api'

// nauto8 FINE mosaic: feathered blur(12px) over a region of the canvas.
export function applyFineMosaic(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (w < 6 || h < 6) return
  const temp = document.createElement('canvas')
  temp.width = w
  temp.height = h
  const tctx = temp.getContext('2d')
  if (!tctx) return
  tctx.drawImage(src, x, y, w, h, 0, 0, w, h)
  tctx.filter = 'blur(12px)'
  tctx.drawImage(temp, 0, 0)
  tctx.filter = 'none'

  const inset = Math.min(10, Math.floor(Math.min(w, h) / 3))
  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const mctx = mask.getContext('2d')
  if (!mctx) return
  mctx.shadowColor = 'white'
  mctx.shadowBlur = 15
  mctx.fillStyle = 'white'
  const iw = Math.max(1, w - inset * 2)
  const ih = Math.max(1, h - inset * 2)
  if (typeof mctx.roundRect === 'function') {
    mctx.beginPath()
    mctx.roundRect(inset, inset, iw, ih, Math.min(20, iw / 2, ih / 2))
    mctx.fill()
  } else {
    mctx.fillRect(inset, inset, iw, ih)
  }

  tctx.globalCompositeOperation = 'destination-in'
  tctx.drawImage(mask, 0, 0)
  tctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(temp, x, y)
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Headless auto-mosaic for one generation: detect genitals, blur each box, save.
// Returns the number of regions mosaicked (0 = nothing detected, image untouched).
export async function autoMosaicGeneration(genId: number): Promise<number> {
  const boxes = await api.generations.detectCensor(genId)
  if (!boxes.length) return 0
  const img = await loadImage(await api.generations.imageData(genId))
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas が使えません')
  ctx.drawImage(img, 0, 0)
  for (const b of boxes) applyFineMosaic(ctx, canvas, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
  await api.generations.saveImage(genId, canvas.toDataURL('image/png'))
  return boxes.length
}
