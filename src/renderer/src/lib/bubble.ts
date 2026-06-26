// Render a dialogue line onto an image canvas as a manga-style speech balloon,
// placed on the background (see services/segment), or a bottom caption band as a
// fallback when there's no clear background (close-ups).
//
// Text is VERTICAL (縦書き): characters stack top-to-bottom, columns run
// right-to-left. The balloon is an ellipse with a hand-drawn wobble and a tail
// spliced into the outline (or a puff-trail for thoughts), and its shape follows
// manga convention: 'spiky' for shouting, 'cloud' for thoughts, else oval.

const FONT = (px: number): string => `bold ${px}px "Hiragino Sans", "Noto Sans JP", sans-serif`

type BalloonStyle = 'rounded' | 'jagged' | 'cloud'

export interface BubbleLayout {
  cols: string[][] // columns of characters; cols[0] is the RIGHTMOST column
  fontSize: number
  cellW: number
  cellH: number
  style: BalloonStyle
  seed: number
  w: number // bounding-box width (px) — used for background placement
  h: number // bounding-box height (px)
}

function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function pickStyle(text: string): BalloonStyle {
  if (/[！!]\s*$/.test(text) || /っ\s*[！!]/.test(text) || /[！!]{2,}/.test(text)) return 'jagged'
  if (/[〜～♡♥❤]/.test(text) || /…\s*$/.test(text)) return 'cloud'
  return 'rounded'
}

// ---- vertical text ----

// Phrase-ish line breaking (manga columns break at 文節 boundaries, not mid-word).
// Heuristic, not a full morphological analyzer: break opportunities sit after
// punctuation and after common particles, never before clinging characters
// (small kana, 、。, long vowel, closing brackets).
const BREAK_PUNCT = /[、。，．！？!?…〜]/
const BREAK_PARTICLE = /[はがをにへとでもやのかねよわぞさ]/
const NO_BREAK_BEFORE = /[、。，．！？!?…ー―々ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョ）」』】〕｝)\]]/

function canBreakAfter(chars: string[], i: number): boolean {
  const nx = chars[i + 1]
  if (nx === undefined || NO_BREAK_BEFORE.test(nx)) return false
  return BREAK_PUNCT.test(chars[i]) || BREAK_PARTICLE.test(chars[i])
}

// Split into vertical columns: prefer to cut at a break opportunity once a column
// reaches `target`, hard-cut at `maxLen`. cols[0] is the rightmost column.
function splitColumns(text: string, target: number, maxLen: number): string[][] {
  const out: string[][] = []
  for (const para of text.split(/\r?\n/)) {
    const chars = [...para]
    let col: string[] = []
    let lastBreak = 0 // column length at the last break opportunity
    for (let i = 0; i < chars.length; i++) {
      col.push(chars[i])
      const can = canBreakAfter(chars, i)
      if (col.length >= maxLen) {
        const cut = lastBreak > 0 && lastBreak < col.length ? lastBreak : col.length
        out.push(col.slice(0, cut))
        col = col.slice(cut)
        lastBreak = 0
      } else if (col.length >= target && can) {
        out.push(col)
        col = []
        lastBreak = 0
      } else if (can) {
        lastBreak = col.length
      }
    }
    if (col.length) out.push(col)
  }
  return out.length ? out : [['']]
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
  const colCap = Math.max(4, Math.floor((imgH * 0.5) / cellH)) // hard cap from image height
  const target = Math.min(colCap, 7) // soft column length → breaks at phrase points
  const cols = splitColumns(text, target, colCap)
  const maxColLen = Math.max(1, ...cols.map((c) => c.length))
  const blockW = cols.length * cellW
  const blockH = maxColLen * cellH
  const style = force ?? pickStyle(text)
  // Circumscribe the text block, with a minimum width so a single column isn't a
  // sliver. Jagged needs extra room so spikes' valleys clear the text.
  const mult = style === 'jagged' ? 1.2 : 1
  const a = Math.max((blockW / 2) * 1.5 + fontSize * 0.5, fontSize * 1.7) * mult
  const b = ((blockH / 2) * 1.42 + fontSize * 0.5) * mult
  return {
    cols,
    fontSize,
    cellW,
    cellH,
    style,
    seed: seedOf(text),
    w: Math.ceil(a * 2),
    h: Math.ceil(b * 2)
  }
}

// ---- balloon outlines (ported from the ../mangas manga app) ----
// All paths are built in LOCAL coords (0..w, 0..h, center w/2,h/2); drawBubble
// translates the context to the bubble origin first. `tip` (local) is the short
// tail apex toward the speaker, or null for no tail.

function prand(seed: number): number {
  const s = Math.sin(seed * 1234.56 + 789.1) * 10000
  return s - Math.floor(s)
}

// Rounded balloon with organic multi-frequency jitter and a flared, curved tail.
function roundedPath(ctx: CanvasRenderingContext2D, w: number, h: number, tip: { x: number; y: number } | null): void {
  const points = 72
  const def = 1
  const cx = w / 2
  const cy = h / 2
  const tx = tip ? tip.x - cx : 0
  const ty = tip ? tip.y - cy : 0
  const tailAngle = Math.atan2(ty, tx)
  const angOffset = 0.1 // thin base
  const sAng = (tailAngle - angOffset + Math.PI * 2) % (Math.PI * 2)
  const eAng = (tailAngle + angOffset + Math.PI * 2) % (Math.PI * 2)
  let tailInjected = false
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const inGap = sAng < eAng ? angle >= sAng && angle <= eAng : angle >= sAng || angle <= eAng
    if (tip && inGap) {
      if (!tailInjected) {
        const tipX = cx + tx
        const tipY = cy + ty
        let ctrlX = cx + tx / 2
        let ctrlY = cy + ty / 2
        const getR = (a: number): number => 0.5 - 0.08 * def + Math.sin(a * 3) * 0.02 * def
        const xL = cx + Math.cos(sAng) * w * getR(sAng)
        const yL = cy + Math.sin(sAng) * h * getR(sAng)
        const xR = cx + Math.cos(eAng) * w * getR(eAng)
        const yR = cy + Math.sin(eAng) * h * getR(eAng)
        const midX = (xL + xR) / 2
        const midY = (yL + yR) / 2
        const nlen = Math.hypot(tipX - midX, tipY - midY) || 1
        const nx = (tipX - midX) / nlen
        const ny = (tipY - midY) / nlen
        if ((ctrlX - midX) * nx + (ctrlY - midY) * ny < 0) {
          ctrlX = midX + nx * 5
          ctrlY = midY + ny * 5
        }
        const flareF = Math.min(w, h) * 0.04
        const sXL = xL + (ctrlX - xL) * 0.4 - Math.sin(sAng) * flareF * (tx > 0 ? 1 : -1)
        const sYL = yL + (ctrlY - yL) * 0.4 + Math.cos(sAng) * flareF * (ty > 0 ? 1 : -1)
        const sXR = xR + (ctrlX - xR) * 0.4 + Math.sin(eAng) * flareF * (tx > 0 ? -1 : 1)
        const sYR = yR + (ctrlY - yR) * 0.4 - Math.cos(eAng) * flareF * (ty > 0 ? -1 : 1)
        ctx.lineTo(xL, yL)
        ctx.quadraticCurveTo(sXL, sYL, tipX, tipY)
        ctx.quadraticCurveTo(sXR, sYR, xR, yR)
        tailInjected = true
      }
      continue
    }
    const jitter = (Math.sin(angle * 3) * 0.02 + Math.sin(angle * 7) * 0.01 + Math.cos(angle * 5) * 0.015) * def
    const r = 0.5 - 0.08 * def + jitter
    const x = cx + Math.cos(angle) * w * r
    const y = cy + Math.sin(angle) * h * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

// Jagged (ギザギザ) balloon: outward spikes with rounded valleys.
function jaggedPath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tip: { x: number; y: number } | null,
  seed: number
): void {
  const spikeCount = 36
  const def = 1
  const cx = w / 2
  const cy = h / 2
  const tx = tip ? tip.x - cx : 0
  const ty = tip ? tip.y - cy : 0
  const tailAngle = Math.atan2(ty, tx)
  const angOffset = 0.12
  const sAng = (tailAngle - angOffset + Math.PI * 2) % (Math.PI * 2)
  const eAng = (tailAngle + angOffset + Math.PI * 2) % (Math.PI * 2)
  let tailInjected = false
  const step = (Math.PI * 2) / spikeCount
  const peak = (i: number): { x: number; y: number; angle: number } => {
    const angle = i * step
    const rOuter = 0.5 + (0.05 + prand(i * 123.456 + seed) * 0.2) * def
    return { x: cx + Math.cos(angle) * w * rOuter, y: cy + Math.sin(angle) * h * rOuter, angle }
  }
  ctx.beginPath()
  let firstMove = true
  for (let i = 0; i < spikeCount; i++) {
    const p1 = peak(i)
    const p2 = peak(i + 1)
    const normAngle = p1.angle % (Math.PI * 2)
    const inGap = sAng < eAng ? normAngle >= sAng && normAngle <= eAng : normAngle >= sAng || normAngle <= eAng
    if (tip && inGap) {
      if (!tailInjected) {
        const tipX = cx + tx
        const tipY = cy + ty
        const rBase = 0.42
        const xL = cx + Math.cos(sAng) * w * rBase
        const yL = cy + Math.sin(sAng) * h * rBase
        const xR = cx + Math.cos(eAng) * w * rBase
        const yR = cy + Math.sin(eAng) * h * rBase
        const ctrlX = cx + tx / 2
        const ctrlY = cy + ty / 2
        ctx.lineTo(xL, yL)
        ctx.quadraticCurveTo(xL + (ctrlX - xL) * 0.4, yL + (ctrlY - yL) * 0.4, tipX, tipY)
        ctx.quadraticCurveTo(xR + (ctrlX - xR) * 0.4, yR + (ctrlY - yR) * 0.4, xR, yR)
        tailInjected = true
      }
      continue
    }
    if (firstMove) {
      ctx.moveTo(p1.x, p1.y)
      firstMove = false
    }
    const midAngle = p1.angle + step / 2
    const rInner = 0.42 - 0.06 * def // rounded valley, kept text-safe
    ctx.quadraticCurveTo(cx + Math.cos(midAngle) * w * rInner, cy + Math.sin(midAngle) * h * rInner, p2.x, p2.y)
  }
  ctx.closePath()
}

// Thought-balloon tail: shrinking puffs trailing toward the thinker (local coords).
function drawThoughtTail(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  startDist: number,
  fontSize: number
): void {
  for (let i = 0; i < 3; i++) {
    const r = fontSize * (0.5 - i * 0.13)
    const d = startDist + i * fontSize * 0.85
    const px = cx + ux * d
    const py = cy + uy * d
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

// Draw the balloon at (x,y) with a (short) tail pointing toward the speaker's mouth.
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  layout: BubbleLayout,
  x: number,
  y: number,
  tailTarget: { x: number; y: number }
): void {
  const { w, h, fontSize, style, seed } = layout
  const cx = w / 2
  const cy = h / 2
  const a = w / 2
  const b = h / 2
  const dx = tailTarget.x - (x + cx)
  const dy = tailTarget.y - (y + cy)
  const dl = Math.hypot(dx, dy) || 1
  const ux = dx / dl
  const uy = dy / dl
  // Distance from center to the ellipse edge in the mouth direction.
  const rEdge = (a * b) / (Math.sqrt((b * ux) ** 2 + (a * uy) ** 2) || 1)
  const visLen = Math.max(fontSize * 0.7, Math.min(dl - rEdge, fontSize * 1.6)) // short tail
  const thought = style === 'cloud'
  const tip = thought ? null : { x: cx + ux * (rEdge + visLen), y: cy + uy * (rEdge + visLen) }

  ctx.save()
  ctx.translate(x, y)

  if (thought) drawThoughtTail(ctx, cx, cy, ux, uy, rEdge + fontSize * 0.5, fontSize)

  const build = (): void => {
    if (style === 'jagged') jaggedPath(ctx, w, h, tip, seed)
    else roundedPath(ctx, w, h, tip)
  }

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = Math.round(fontSize * 0.45)
  ctx.shadowOffsetY = Math.round(fontSize * 0.12)
  build()
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.fill()
  ctx.restore()

  ctx.lineWidth = Math.max(2, fontSize * 0.09)
  ctx.strokeStyle = '#1b1b1b'
  ctx.lineJoin = 'round'
  build()
  ctx.stroke()

  drawColumns(ctx, layout, cx, cy, '#161616')
  ctx.restore()
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
