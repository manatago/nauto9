// Render a dialogue line onto an image canvas as a manga-style speech balloon,
// placed on the background (see services/segment), or a bottom caption band as a
// fallback when there's no clear background (close-ups).
//
// Text is VERTICAL (縦書き): characters stack top-to-bottom, columns run
// right-to-left. The balloon is an ellipse with a hand-drawn wobble and a tail
// spliced into the outline (or a puff-trail for thoughts), and its shape follows
// manga convention: 'spiky' for shouting, 'cloud' for thoughts, else oval.

// Handwriting font (declared in index.css); falls back to system JP fonts.
const FONT = (px: number): string => `${px}px "KleeOne", "Hiragino Sans", "Noto Sans JP", sans-serif`

// Balloon opacity — lets the image show through behind the bubble.
const BUBBLE_ALPHA = 0.8

// Ensure the bundled handwriting font is loaded before measuring/drawing on the
// canvas (canvas silently falls back if the face isn't ready yet).
export async function ensureBubbleFont(): Promise<void> {
  try {
    await document.fonts.load('32px "KleeOne"')
  } catch {
    /* fall back to system fonts */
  }
}

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
  textW: number // the text block's width (inside the padding)
  textH: number // the text block's height
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
const BREAK_PUNCT = /[、。，．！？!?…‥〜]/
const BREAK_PARTICLE = /[はがをにへとでもやのかねよわぞさ]/
// Always start a new column after these (unless the next char clings).
const FORCE_BREAK = /[、。！？!?…‥]/
// Characters that cling to the preceding one (never break before them): closing
// punctuation, small kana, long vowel, hearts, 〜 …
const NO_BREAK_BEFORE =
  /[、。，．！？!?…‥ー―々ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョ）」』】〕｝)\]♡♥❤〜～]/
// Multi-char particles/suffixes that end a 文節 — break AFTER them.
const MULTI_PARTICLES = [
  'けれど', 'ばかり', 'くらい', 'ぐらい', 'ながら', 'だけ', 'まで', 'ほど', 'など', 'から',
  'ので', 'のに', 'けど', 'ても', 'でも', 'とか', 'なら', 'より', 'って', 'では', 'には', 'とは',
  'こそ', 'さえ', 'しか'
]
// 2-char heads of the above, so a single particle that merely STARTS a multi
// particle (か in から, で in では…) doesn't break the word.
const MULTI_HEAD = new Set(MULTI_PARTICLES.map((p) => p.slice(0, 2)))

function canBreakAfter(chars: string[], i: number): boolean {
  const nx = chars[i + 1]
  if (nx === undefined || NO_BREAK_BEFORE.test(nx)) return false
  if (BREAK_PUNCT.test(chars[i])) return true
  for (const p of MULTI_PARTICLES) {
    if (i + 1 >= p.length && chars.slice(i - p.length + 1, i + 1).join('') === p) return true
  }
  if (BREAK_PARTICLE.test(chars[i]) && !MULTI_HEAD.has(chars[i] + (chars[i + 1] ?? ''))) return true
  return false
}

// Break priority: (1) always start a new column after 感嘆符/句読点, then
// (2) wrap each resulting segment at 文節 boundaries, BALANCED so columns are
// roughly even (avoid one over-long column) — never splitting a word. cols[0] is
// the rightmost column. Manual newlines split columns too.
export function splitColumns(text: string, softCap: number, hardCap: number): string[][] {
  const out: string[][] = []
  for (const para of text.split(/\r?\n/)) {
    const chars = [...para]
    // (1) segments split at forced punctuation
    const segments: string[][] = []
    let seg: string[] = []
    for (let i = 0; i < chars.length; i++) {
      seg.push(chars[i])
      if (canBreakAfter(chars, i) && FORCE_BREAK.test(chars[i])) {
        segments.push(seg)
        seg = []
      }
    }
    if (seg.length) segments.push(seg)
    // (2) balanced 文節 wrap per segment
    for (const s of segments) for (const c of balancedWrap(s, softCap, hardCap)) out.push(c)
  }
  return out.length ? out : [['']]
}

function balancedWrap(chars: string[], softCap: number, hardCap: number): string[][] {
  const L = chars.length
  if (L <= softCap) return [chars]
  // Even split: pick the column count, then aim for L/count per column (≤ softCap).
  const numCols = Math.ceil(L / softCap)
  const target = Math.ceil(L / numCols)
  const cols: string[][] = []
  let col: string[] = []
  let lastBreak = 0 // length at the last 文節 opportunity in the current column
  for (let i = 0; i < L; i++) {
    col.push(chars[i])
    const can = canBreakAfter(chars, i)
    if (can) {
      if (col.length >= target) {
        cols.push(col)
        col = []
        lastBreak = 0
        continue
      }
      lastBreak = col.length
    }
    // Over the cap: cut back to the last 文節 point. If there's none, KEEP GOING
    // rather than splitting a word (the user can newline manually).
    if (col.length >= hardCap && lastBreak > 0) {
      cols.push(col.slice(0, lastBreak))
      col = col.slice(lastBreak)
      lastBreak = 0
    }
  }
  if (col.length) cols.push(col)
  return cols
}

// Glyphs that rotate 90° in vertical writing (long vowel, dashes, brackets, …).
const V_ROTATE = /[ー―‐−—~〜「」『』【】〔〕（）｛｝()[\]<>＜＞…⋯]/
// Small punctuation that sits in the upper-right of its cell.
const V_TOPRIGHT = /[、。，．]/
// Small kana — nudged toward the upper-right (vertical-writing convention).
const V_SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮ]/

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
  else if (V_TOPRIGHT.test(ch)) ctx.translate(fs * 0.5, -fs * 0.34) // 、。 to upper-right
  else if (V_SMALL_KANA.test(ch)) ctx.translate(fs * 0.12, -fs * 0.08) // small kana up-right
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
  const heightCap = Math.max(4, Math.floor((imgH * 0.5) / cellH)) // image-height limit
  const hardCap = Math.min(heightCap, 13) // never exceed 13 chars
  const softCap = Math.min(hardCap, 12) // aim for ≤12, balanced
  const cols = splitColumns(text, softCap, hardCap)
  const maxColLen = Math.max(1, ...cols.map((c) => c.length))
  const blockW = cols.length * cellW
  const blockH = maxColLen * cellH
  const style = force ?? pickStyle(text)
  // Circumscribe the text block, with a minimum width so a single column isn't a
  // sliver. (Jagged spikes are modest, so its valleys already clear the text.)
  const a = Math.max((blockW / 2) * 1.55 + fontSize * 0.95, fontSize * 1.9)
  const b = (blockH / 2) * 1.48 + fontSize * 0.95
  return {
    cols,
    fontSize,
    cellW,
    cellH,
    style,
    seed: seedOf(text),
    w: Math.ceil(a * 2),
    h: Math.ceil(b * 2),
    textW: blockW,
    textH: blockH
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

// Rounded balloon BODY with organic multi-frequency jitter (no tail).
function roundedBody(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const points = 72
  const cx = w / 2
  const cy = h / 2
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const jitter = Math.sin(angle * 3) * 0.02 + Math.sin(angle * 7) * 0.01 + Math.cos(angle * 5) * 0.015
    const r = 0.42 + jitter
    const x = cx + Math.cos(angle) * w * r
    const y = cy + Math.sin(angle) * h * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

// Jagged (ギザギザ) balloon BODY: modest outward spikes with rounded valleys.
function jaggedBody(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const spikeCount = 32
  const cx = w / 2
  const cy = h / 2
  const step = (Math.PI * 2) / spikeCount
  const peak = (i: number): { x: number; y: number; angle: number } => {
    const angle = i * step
    const r = 0.45 + (0.04 + prand(i * 123.456 + seed) * 0.07) // peaks ~0.49–0.56
    return { x: cx + Math.cos(angle) * w * r, y: cy + Math.sin(angle) * h * r, angle }
  }
  ctx.beginPath()
  const p0 = peak(0)
  ctx.moveTo(p0.x, p0.y)
  for (let i = 0; i < spikeCount; i++) {
    const p1 = peak(i)
    const p2 = peak(i + 1)
    const midAngle = p1.angle + step / 2
    const rInner = 0.42 // valley (clears the text)
    ctx.quadraticCurveTo(cx + Math.cos(midAngle) * w * rInner, cy + Math.sin(midAngle) * h * rInner, p2.x, p2.y)
  }
  ctx.closePath()
}

// A CURVED, pointed (hook-shaped) tail as a SEPARATE subpath; its base sits
// inside the body so filling the union merges them with no self-intersection.
// Both sides bend the SAME way (perpendicular to the tail axis), so the tail
// curves to one side and stays sharp at the tip — not a symmetric teardrop.
function addTail(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tip: { x: number; y: number },
  flip: boolean
): void {
  const cx = w / 2
  const cy = h / 2
  const tt = Math.atan2((tip.y - cy) / (h / 2), (tip.x - cx) / (w / 2))
  const half = 0.13 // thin base
  const rBase = 0.34 // inside both bodies so the tail overlaps
  const b1 = { x: cx + Math.cos(tt - half) * w * rBase, y: cy + Math.sin(tt - half) * h * rBase }
  const b2 = { x: cx + Math.cos(tt + half) * w * rBase, y: cy + Math.sin(tt + half) * h * rBase }
  const mid = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 }
  const ax = tip.x - mid.x
  const ay = tip.y - mid.y
  const al = Math.hypot(ax, ay) || 1
  // Perpendicular to the tail axis; both control points shift the same way. `flip`
  // reverses which side the hook curves toward.
  const s = flip ? -1 : 1
  const px = (-ay / al) * s
  const py = (ax / al) * s
  const bend = al * 0.38
  ctx.moveTo(b1.x, b1.y)
  ctx.quadraticCurveTo((b1.x + tip.x) / 2 + px * bend, (b1.y + tip.y) / 2 + py * bend, tip.x, tip.y)
  ctx.quadraticCurveTo((b2.x + tip.x) / 2 + px * bend, (b2.y + tip.y) / 2 + py * bend, b2.x, b2.y)
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
    ctx.lineWidth = Math.max(1.5, fontSize * 0.06)
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
  tailTarget: { x: number; y: number },
  tailFlip = false
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
  // Distance from center to the body edge in the tail direction (×1.18 to clear
  // jitter/spikes). The tail extends a bit past that toward the speaker, but NEVER
  // past the target — so it stops at the face boundary instead of entering it.
  const rEdge = ((a * b) / (Math.sqrt((b * ux) ** 2 + (a * uy) ** 2) || 1)) * 1.18
  // Normal tail just pokes out a little; jagged can be a touch longer.
  const tailCap = style === 'jagged' ? fontSize * 1.2 : fontSize * 0.7
  const visLen = Math.max(0, Math.min(dl - rEdge, tailCap))
  const thought = style === 'cloud'
  const tip =
    thought || visLen < 2 ? null : { x: cx + ux * (rEdge + visLen), y: cy + uy * (rEdge + visLen) }

  // Render the balloon OPAQUE on an offscreen canvas first (so the stroke-then-fill
  // trick still hides every internal line), then composite it at BUBBLE_ALPHA so
  // the image shows through without those internal lines bleeding. Text is drawn
  // on the main canvas at full opacity for readability.
  const off = document.createElement('canvas')
  off.width = ctx.canvas.width
  off.height = ctx.canvas.height
  const octx = off.getContext('2d')
  if (!octx) return
  octx.translate(x, y)
  // startDist < rEdge so the nearest puff overlaps the body and reads as one piece.
  if (thought) drawThoughtTail(octx, cx, cy, ux, uy, rEdge - fontSize * 0.15, fontSize)

  // Body + tail as two subpaths in one path → fill (nonzero) = their union.
  if (style === 'jagged') jaggedBody(octx, w, h, seed)
  else roundedBody(octx, w, h)
  if (tip) addTail(octx, w, h, tip, tailFlip)

  const line = Math.max(1.5, fontSize * 0.06)
  octx.save()
  octx.shadowColor = 'rgba(0,0,0,0.35)'
  octx.shadowBlur = Math.round(fontSize * 0.45)
  octx.shadowOffsetY = Math.round(fontSize * 0.12)
  octx.lineWidth = line * 2
  octx.strokeStyle = '#1b1b1b'
  octx.lineJoin = 'round'
  octx.stroke()
  octx.restore()
  octx.fillStyle = '#ffffff'
  octx.fill()

  ctx.save()
  ctx.globalAlpha = BUBBLE_ALPHA
  ctx.drawImage(off, 0, 0)
  ctx.restore()

  ctx.save()
  ctx.translate(x, y)
  drawColumns(ctx, layout, cx, cy, '#161616')
  ctx.restore()
}

// ---- fallback caption band (horizontal subtitle) ----

// Horizontal wrap for the narration band — break at 文節/punctuation opportunities
// near the width limit (never mid-word unless a single run overflows), honour
// manual newlines.
function wrapH(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\r?\n/)) {
    const chars = [...para]
    let line: string[] = []
    let lastBreak = 0
    for (let i = 0; i < chars.length; i++) {
      line.push(chars[i])
      const can = canBreakAfter(chars, i)
      if (ctx.measureText(line.join('')).width > maxW && line.length > 1) {
        if (lastBreak > 0 && lastBreak < line.length) {
          lines.push(line.slice(0, lastBreak).join(''))
          line = line.slice(lastBreak)
        } else {
          const last = line.pop() as string
          lines.push(line.join(''))
          line = [last]
        }
        lastBreak = 0
      } else if (can) {
        lastBreak = line.length
      }
    }
    if (line.length) lines.push(line.join(''))
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
