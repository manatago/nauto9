// Render a dialogue line onto an image canvas as a manga-style speech balloon
// placed on the background (see services/segment), or a bottom caption band as a
// fallback when there's no clear background (close-ups).
//
// The balloon is an ELLIPSE (not a rounded rect) with a subtle hand-drawn wobble,
// a tail spliced into the outline so fill+stroke stay clean, and a shape that
// varies with the line: 'spiky' for shouting, 'cloud' for soft/teasing, else oval.

const FONT = (px: number): string => `bold ${px}px "Hiragino Sans", "Noto Sans JP", sans-serif`

type BalloonStyle = 'oval' | 'cloud' | 'spiky'

export interface BubbleLayout {
  lines: string[]
  fontSize: number
  lineH: number
  style: BalloonStyle
  seed: number
  w: number // ellipse bounding-box width (px) — used for background placement
  h: number // ellipse bounding-box height (px)
}

// Deterministic PRNG so the same line always wobbles the same way (idempotent
// re-burns) — Math.random would change the shape every press.
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

// Wrap text to a max pixel width. Japanese has no spaces, so wrap per character;
// honour explicit newlines.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

// `force` overrides the auto style pick: 'oval' = 通常, 'spiky' = 叫び, 'cloud' = 心の中.
export function measureBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  imgW: number,
  force?: BalloonStyle
): BubbleLayout {
  const fontSize = Math.min(64, Math.max(15, Math.round(imgW / 26)))
  ctx.font = FONT(fontSize)
  const lineH = Math.round(fontSize * 1.4)
  const lines = wrap(ctx, text, imgW * 0.4)
  let textW = 0
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width)
  const textH = lines.length * lineH
  // Ellipse circumscribing the text block (corners inside), with a little air.
  const a = (textW / 2) * 1.42 + fontSize * 0.5
  const b = (textH / 2) * 1.5 + fontSize * 0.5
  return {
    lines,
    fontSize,
    lineH,
    style: force ?? pickStyle(text),
    seed: seedOf(text),
    w: Math.ceil(a * 2),
    h: Math.ceil(b * 2)
  }
}

function angDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

// Build the closed balloon outline as points (drawn with straight segments — at
// ~72 points an ellipse reads as smooth, and the tail apex stays sharp). The tail
// is spliced into the perimeter so a single fill+stroke yields a clean outline.
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
    return k * (1 + (rnd() - 0.5) * 0.05) // hand-drawn wobble
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

  // Tail direction in ellipse-parameter space, with apex extended toward speaker.
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

  // Walk the perimeter starting OPPOSITE the tail so the tail window sits mid-loop
  // (no array wrap), and splice [base1, apex, base2] in where the window is.
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

function drawLines(
  ctx: CanvasRenderingContext2D,
  layout: BubbleLayout,
  cx: number,
  topY: number,
  fill: string,
  stroke?: { color: string; width: number }
): void {
  ctx.font = FONT(layout.fontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  layout.lines.forEach((line, i) => {
    const ly = topY + i * layout.lineH
    if (stroke) {
      ctx.lineWidth = stroke.width
      ctx.strokeStyle = stroke.color
      ctx.strokeText(line, cx, ly)
    }
    ctx.fillStyle = fill
    ctx.fillText(line, cx, ly)
  })
}

// Thought-balloon tail: a few shrinking puffs trailing toward the thinker
// (instead of a pointed tail). Drawn before the body so the nearest puff tucks
// under it.
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

// Draw the balloon at (x,y) with a tail pointing toward the speaker.
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
  // Inner thought (cloud) gets a puff-trail tail; others get a pointed tail
  // spliced into the outline.
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

  drawLines(ctx, layout, cx, cy - (layout.lines.length * layout.lineH) / 2, '#161616')
}

// Fallback: a translucent dark band across the bottom with the line in white.
export function drawCaptionBand(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  text: string
): void {
  const layout = measureBubble(ctx, text, canvasW)
  const pad = Math.round(layout.fontSize * 0.6)
  const bandH = layout.lines.length * layout.lineH + pad * 2
  const top = canvasH - bandH
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, top, canvasW, bandH)
  drawLines(ctx, layout, canvasW / 2, top + pad, '#ffffff', {
    color: 'rgba(0,0,0,0.8)',
    width: Math.max(2, layout.fontSize * 0.12)
  })
}
