// Pure placement search for the dialogue bubble. Given a foreground-probability
// mask (w×h, 0..1 where 1 = subject/skin), find the box of size (bw,bh) that
// overlaps the LEAST foreground — i.e. lands on background — with a mild bias
// toward the image edges. All coordinates are in mask space. No IO, unit-tested.
export interface PlaceResult {
  x: number
  y: number
  meanFg: number // mean foreground probability inside the chosen box (0 = pure bg)
}

export function bestBackgroundBox(
  fg: Float32Array,
  w: number,
  h: number,
  bw: number,
  bh: number
): PlaceResult {
  bw = Math.max(1, Math.min(Math.round(bw), w))
  bh = Math.max(1, Math.min(Math.round(bh), h))

  // Summed-area table so any box's foreground sum is O(1).
  const iw = w + 1
  const I = new Float64Array(iw * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += fg[y * w + x]
      I[(y + 1) * iw + (x + 1)] = I[y * iw + (x + 1)] + rowSum
    }
  }
  const rect = (x0: number, y0: number, x1: number, y1: number): number =>
    I[y1 * iw + x1] - I[y0 * iw + x1] - I[y1 * iw + x0] + I[y0 * iw + x0]

  const area = bw * bh
  const maxX = w - bw
  const maxY = h - bh
  const step = Math.max(1, Math.round(Math.min(w, h) / 48))

  let best: PlaceResult = { x: 0, y: 0, meanFg: Infinity }
  let bestScore = Infinity
  // Always include the far edges even if step doesn't land on them.
  const xs = positions(maxX, step)
  const ys = positions(maxY, step)
  for (const y of ys) {
    for (const x of xs) {
      const meanFg = rect(x, y, x + bw, y + bh) / area
      // Mild edge preference: reward the box center being away from image center
      // (subjects tend to be centered), so ties break toward the periphery.
      const cx = x + bw / 2
      const cy = y + bh / 2
      const dist = Math.hypot((cx - w / 2) / w, (cy - h / 2) / h)
      const score = meanFg - 0.04 * dist
      if (score < bestScore) {
        bestScore = score
        best = { x, y, meanFg }
      }
    }
  }
  return best
}

function positions(max: number, step: number): number[] {
  const out: number[] = []
  for (let v = 0; v < max; v += step) out.push(v)
  out.push(max) // ensure the far edge is evaluated
  return out
}
