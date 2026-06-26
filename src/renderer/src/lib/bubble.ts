// Render a dialogue line onto an image canvas — as a manga-style speech bubble
// placed on the background (see services/segment), or a bottom caption band as a
// fallback when there's no clear background (close-ups).

const FONT = (px: number): string => `bold ${px}px "Hiragino Sans", "Noto Sans JP", sans-serif`

export interface BubbleLayout {
  lines: string[]
  fontSize: number
  lineH: number
  padX: number
  padY: number
  w: number // outer bubble width (px)
  h: number // outer bubble height (px)
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

export function measureBubble(ctx: CanvasRenderingContext2D, text: string, imgW: number): BubbleLayout {
  const fontSize = Math.min(64, Math.max(15, Math.round(imgW / 26)))
  ctx.font = FONT(fontSize)
  const padX = Math.round(fontSize * 0.7)
  const padY = Math.round(fontSize * 0.5)
  const lineH = Math.round(fontSize * 1.35)
  const lines = wrap(ctx, text, imgW * 0.42)
  let textW = 0
  for (const l of lines) textW = Math.max(textW, ctx.measureText(l).width)
  return {
    lines,
    fontSize,
    lineH,
    padX,
    padY,
    w: Math.ceil(textW + padX * 2),
    h: lines.length * lineH + padY * 2
  }
}

// Build a rounded-rect path with a triangular tail on one side, as a single path
// so fill + stroke produce a clean outline.
function bubblePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  tail: number // tail size
): void {
  r = Math.min(r, w / 2, h / 2)
  const right = x + w
  const bottom = y + h
  // tail base centered on the chosen edge (clamped away from the corners)
  const tx = Math.min(right - r - tail, Math.max(x + r + tail, x + w / 2))
  const ty = Math.min(bottom - r - tail, Math.max(y + r + tail, y + h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  // top edge
  if (side === 'top') {
    ctx.lineTo(tx - tail, y)
    ctx.lineTo(tx, y - tail)
    ctx.lineTo(tx + tail, y)
  }
  ctx.lineTo(right - r, y)
  ctx.arcTo(right, y, right, y + r, r)
  // right edge
  if (side === 'right') {
    ctx.lineTo(right, ty - tail)
    ctx.lineTo(right + tail, ty)
    ctx.lineTo(right, ty + tail)
  }
  ctx.lineTo(right, bottom - r)
  ctx.arcTo(right, bottom, right - r, bottom, r)
  // bottom edge
  if (side === 'bottom') {
    ctx.lineTo(tx + tail, bottom)
    ctx.lineTo(tx, bottom + tail)
    ctx.lineTo(tx - tail, bottom)
  }
  ctx.lineTo(x + r, bottom)
  ctx.arcTo(x, bottom, x, bottom - r, r)
  // left edge
  if (side === 'left') {
    ctx.lineTo(x, ty + tail)
    ctx.lineTo(x - tail, ty)
    ctx.lineTo(x, ty - tail)
  }
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
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

// Draw the speech bubble at (x,y) with a tail pointing toward the speaker.
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
  const dx = tailTarget.x - cx
  const dy = tailTarget.y - cy
  const side =
    Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
  const tail = Math.round(fontSize * 0.6)
  const r = Math.round(fontSize * 0.5)

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = Math.round(fontSize * 0.4)
  ctx.shadowOffsetY = Math.round(fontSize * 0.1)
  bubblePath(ctx, x, y, w, h, r, side, tail)
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  ctx.fill()
  ctx.restore()

  ctx.lineWidth = Math.max(2, fontSize * 0.08)
  ctx.strokeStyle = '#1b1b1b'
  bubblePath(ctx, x, y, w, h, r, side, tail)
  ctx.stroke()

  drawLines(ctx, layout, cx, y + layout.padY, '#161616')
}

// Fallback: a translucent dark band across the bottom with the line in white.
export function drawCaptionBand(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  text: string
): void {
  const layout = measureBubble(ctx, text, canvasW)
  const bandH = layout.lines.length * layout.lineH + layout.padY * 2
  const top = canvasH - bandH
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, top, canvasW, bandH)
  drawLines(ctx, layout, canvasW / 2, top + layout.padY, '#ffffff', {
    color: 'rgba(0,0,0,0.8)',
    width: Math.max(2, layout.fontSize * 0.12)
  })
}
