// Render a dialogue line onto an image canvas as a manga-style speech balloon,
// placed on the background (see services/segment), or a bottom caption band as a
// fallback when there's no clear background (close-ups).
//
// Text is VERTICAL (縦書き): characters stack top-to-bottom, columns run
// right-to-left. The balloon is an ellipse with a hand-drawn wobble and a tail
// spliced into the outline (or a puff-trail for thoughts), and its shape follows
// manga convention: 'spiky' for shouting, 'cloud' for thoughts, else oval.

const FONT = (px: number): string => `bold ${px}px "Hiragino Sans", "Noto Sans JP", sans-serif`

type BalloonStyle = 'oval' | 'cloud' | 'spiky'

export interface BubbleLayout {
  cols: string[][] // columns of characters; cols[0] is the RIGHTMOST column
  fontSize: number
  cellW: number
  cellH: number
  style: BalloonStyle
  seed: number
  w: number // ellipse bounding-box width (px) — used for background placement
  h: number // ellipse bounding-box height (px)
}

// Deterministic PRNG so the same line always wobbles the same way.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function pickStyle(text: string): BalloonStyle {
  if (/[！!]\s*$/.test(text) || /っ\s*[！!]/.test(text) || /[！!]{2,}/.test(text)) return 'spiky'
  if (/[〜～♡♥❤]/.test(text) || /…\s*$/.test(text)) return 'cloud'
  return 'oval'
}

// ---- vertical text ----

// Split text into vertical columns (top-to-bottom), wrapping at maxPerCol and at
// explicit newlines. cols[0] is the first chars = the rightmost column.
function wrapVertical(text: string, maxPerCol: number): string[][] {
  const cols: string[][] = []
  for (const para of text.split(/\r?\n/)) {
    let col: string[] = []
    for (const ch of [...para]) {
      col.push(ch)
      if (col.length >= maxPerCol) {
        cols.push(col)
        col = []
      }
    }
    if (col.length) cols.push(col)
  }
  return cols.length ? cols : [['']]
}

// Glyphs that rotate 90° in vertical writing (long vowel, dashes, brackets, …).
const V_ROTATE = /[ー―‐−—~〜「」『』【】〔〕（）｛｝()[\]<>＜＞…⋯]/
// Small punctuation that sits in the upper-right of its cell.
const V_TOPRIGHT = /[、。，．]/

function drawVChar(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  fs: number,
  fill: string,
  stroke?: { color: string; width: number }
): void {
  ctx.save()
  ctx.translate(x, y)
  if (V_ROTATE.test(ch)) ctx.rotate(Math.PI / 2)
  else if (V_TOPRIGHT.test(ch)) ctx.translate(fs * 0.3, -fs * 0.3)
  if (stroke) {
    ctx.lineWidth = stroke.width
    ctx.strokeStyle = stroke.color
    ctx.lineJoin = 'round'
    ctx.strokeText(ch, 0, 0)
  }
  ctx.fillStyle = fill
  ctx.fillText(ch, 0, 0)
  ctx.restore()
}

function drawColumns(
  ctx: CanvasRenderingContext2D,
  layout: BubbleLayout,
  cx: number,
  cy: number,
  fill: string,
  stroke?: { color: string; width: number }
): void {
  const { cols, cellW, cellH, fontSize } = layout
  ctx.font = FONT(fontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const right = cx + (cols.length * cellW) / 2
  const maxLen = Math.max(1, ...cols.map((c) => c.length))
  const blockTop = cy - (maxLen * cellH) / 2
  cols.forEach((col, ci) => {
    const colX = right - (ci + 0.5) * cellW
    col.forEach((ch, ri) => drawVChar(ctx, ch, colX, blockTop + (ri + 0.5) * cellH, fontSize, fill, stroke))
  })
}

export function measureBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  imgW: number,
  imgH: number,
  force?: BalloonStyle
): BubbleLayout {
  const fontSize = Math.min(64, Math.max(15, Math.round(imgW / 26)))
  ctx.font = FONT(fontSize)
  const cellW = Math.round(fontSize * 1.12)
  const cellH = Math.round(fontSize * 1.02)
  const maxPerCol = Math.max(3, Math.floor((imgH * 0.5) / cellH))
  const cols = wrapVertical(text, maxPerCol)
  const maxLen = Math.max(1, ...cols.map((c) => c.length))
  const blockW = cols.length * cellW
  const blockH = maxLen * cellH
  // Ellipse circumscribing the text block, with a minimum width so a single
  // column doesn't become a sliver.
  const a = Math.max((blockW / 2) * 1.5 + fontSize * 0.5, fontSize * 1.7)
  const b = (blockH / 2) * 1.42 + fontSize * 0.5
  return {
    cols,
    fontSize,
    cellW,
    cellH,
    style: force ?? pickStyle(text),
    seed: seedOf(text),
    w: Math.ceil(a * 2),
    h: Math.ceil(b * 2)
  }
}

// ---- balloon outline ----

function angDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

function balloonOutline(
  cx: number,
  cy: number,
  a: number,
  b: number,
  style: BalloonStyle,
  seed: number,
  tail: { x: number; y: number } | null
): { x: number; y: number }[] {
  const N = style === 'spiky' ? 48 : 72
  const rnd = mulberry32(seed)
  const radius = (t: number, i: number): number => {
    let k = 1
    if (style === 'cloud') k = 1 + 0.05 * Math.sin(t * 9)
    else if (style === 'spiky') k = i % 2 === 0 ? 1.14 : 0.9
    return k * (1 + (rnd() - 0.5) * 0.05)
  }
  const pt = (t: number, i: number): { x: number; y: number } => {
    const k = radius(t, i)
    return { x: cx + Math.cos(t) * a * k, y: cy + Math.sin(t) * b * k }
  }

  if (!tail) {
    const out: { x: number; y: number }[] = []
    for (let i = 0; i < N; i++) out.push(pt((i / N) * Math.PI * 2, i))
    return out
  }

  const tt = Math.atan2((tail.y - cy) / b, (tail.x - cx) / a)
  const dθ = 0.24
  const edgeX = cx + Math.cos(tt) * a
  const edgeY = cy + Math.sin(tt) * b
  const dirLen = Math.hypot(tail.x - edgeX, tail.y - edgeY) || 1
  const tailLen = Math.min(dirLen * 0.7, Math.max(a, b) * 0.95)
  const apex = {
    x: edgeX + ((tail.x - edgeX) / dirLen) * tailLen,
    y: edgeY + ((tail.y - edgeY) / dirLen) * tailLen
  }

  const out: { x: number; y: number }[] = []
  let spliced = false
  for (let i = 0; i < N; i++) {
    const t = tt + Math.PI + (i / N) * Math.PI * 2
    if (angDiff(t, tt) < dθ) {
      if (!spliced) {
        out.push(pt(tt - dθ, i))
        out.push(apex)
        out.push(pt(tt + dθ, i))
        spliced = true
      }
      continue
    }
    out.push(pt(t, i))
  }
  return out
}

// Thought-balloon tail: shrinking puffs trailing toward the thinker.
function drawThoughtTail(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  a: number,
  b: number,
  target: { x: number; y: number },
  fontSize: number
): void {
  const tt = Math.atan2((target.y - cy) / b, (target.x - cx) / a)
  const edgeX = cx + Math.cos(tt) * a
  const edgeY = cy + Math.sin(tt) * b
  const dist = Math.hypot(target.x - edgeX, target.y - edgeY) || 1
  const ux = (target.x - edgeX) / dist
  const uy = (target.y - edgeY) / dist
  for (let i = 0; i < 3; i++) {
    const f = (i + 1) / 4
    const r = fontSize * (0.5 - i * 0.13)
    const px = edgeX + ux * dist * f * 0.75
    const py = edgeY + uy * dist * f * 0.75
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur = Math.round(fontSize * 0.3)
    ctx.beginPath()
    ctx.ellipse(px, py, Math.max(2, r), Math.max(2, r * 0.85), 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = Math.max(2, fontSize * 0.08)
    ctx.strokeStyle = '#1b1b1b'
    ctx.stroke()
  }
}

// Draw the balloon at (x,y) with a tail pointing toward the speaker's mouth.
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  layout: BubbleLayout,
  x: number,
  y: number,
  tailTarget: { x: number; y: number }
): void {
  const { w, h, fontSize } = layout
  const cx = x + w / 2
  const cy = y + h / 2
  const thought = layout.style === 'cloud'
  if (thought) drawThoughtTail(ctx, cx, cy, w / 2, h / 2, tailTarget, fontSize)
  const pts = balloonOutline(cx, cy, w / 2, h / 2, layout.style, layout.seed, thought ? null : tailTarget)

  const path = (): void => {
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
  }

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = Math.round(fontSize * 0.45)
  ctx.shadowOffsetY = Math.round(fontSize * 0.12)
  path()
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.fill()
  ctx.restore()

  ctx.lineWidth = Math.max(2, fontSize * 0.09)
  ctx.strokeStyle = '#1b1b1b'
  ctx.lineJoin = 'round'
  path()
  ctx.stroke()

  drawColumns(ctx, layout, cx, cy, '#161616')
}

// ---- fallback caption band (horizontal subtitle) ----

function wrapH(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\r?\n/)) {
    let cur = ''
    for (const ch of para) {
      if (ctx.measureText(cur + ch).width > maxW && cur) {
        lines.push(cur)
        cur = ch
      } else {
        cur += ch
      }
    }
    lines.push(cur)
  }
  return lines.length ? lines : ['']
}

export function drawCaptionBand(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  text: string
): void {
  const fontSize = Math.min(64, Math.max(15, Math.round(canvasW / 26)))
  ctx.font = FONT(fontSize)
  const lineH = Math.round(fontSize * 1.4)
  const pad = Math.round(fontSize * 0.6)
  const lines = wrapH(ctx, text, canvasW * 0.92)
  const bandH = lines.length * lineH + pad * 2
  const top = canvasH - bandH
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, top, canvasW, bandH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  lines.forEach((line, i) => {
    const ly = top + pad + i * lineH
    ctx.lineWidth = Math.max(2, fontSize * 0.12)
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.strokeText(line, canvasW / 2, ly)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(line, canvasW / 2, ly)
  })
}
