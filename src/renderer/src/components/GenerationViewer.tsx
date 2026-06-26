import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Paintbrush,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  SquareDashedMousePointer,
  Undo2,
  Wand2,
  X
} from 'lucide-react'
import type { Generation } from '@shared/types'
import { api } from '../api'
import { applyFineMosaic, loadImage } from '../lib/mosaic'
import { drawBubble, drawCaptionBand, measureBubble } from '../lib/bubble'
import { useToast } from './Toast'

interface Props {
  generations: Generation[] // success images to navigate
  index: number
  onClose: () => void
  onChanged: () => void
}

export default function GenerationViewer({
  generations,
  index,
  onClose,
  onChanged
}: Props): JSX.Element | null {
  const toast = useToast()
  const [idx, setIdx] = useState(index)
  const [playing, setPlaying] = useState(false)
  const [mosaic, setMosaic] = useState(false)
  const [inpaint, setInpaint] = useState(false)
  const [inpaintPrompt, setInpaintPrompt] = useState('')
  const [brush, setBrush] = useState(48)
  // Brush-size preview ring that follows the cursor over the inpaint mask, so the
  // covered area is visible before painting. Screen px (fixed-positioned).
  const [cursor, setCursor] = useState<{ x: number; y: number; d: number } | null>(null)
  const [busy, setBusy] = useState(false)
  // Previous image data, kept only right after a regenerate (1-step undo).
  // Cleared on navigation / close.
  const [undoData, setUndoData] = useState<string | null>(null)
  // Prompt editing (updates the source character & situation records).
  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [charPrompt, setCharPrompt] = useState('')
  const [sitPrompt, setSitPrompt] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [dlgBusy, setDlgBusy] = useState(false) // separate so its spinner shows on the right button
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const paintRef = useRef<{ x: number; y: number } | null>(null)
  // Clear the mask only on a fresh entry into inpaint mode. After a re-描画 the
  // image reloads but we keep the painted region so it can be redrawn again.
  const resetMaskRef = useRef(true)

  const cur = generations[idx]
  const go = useCallback(
    (d: number) => {
      if (mosaic || inpaint) return
      setIdx((i) => (i + d + generations.length) % generations.length)
    },
    [generations.length, mosaic, inpaint]
  )

  // The undo is only valid for the image just regenerated; drop it on move.
  useEffect(() => {
    setUndoData(null)
  }, [idx])

  // Keep the dialogue field synced with the current image (and after gen).
  useEffect(() => {
    setDialogue(cur?.dialogue ?? '')
  }, [cur?.id, cur?.dialogue])

  // slideshow auto-advance
  useEffect(() => {
    if (!playing || mosaic || inpaint) return
    const t = setInterval(() => setIdx((i) => (i + 1) % generations.length), 3000)
    return () => clearInterval(t)
  }, [playing, mosaic, inpaint, generations.length])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Don't hijack keys while typing in a prompt field (space, arrows, etc.).
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        if (mosaic) setMosaic(false)
        else if (inpaint) setInpaint(false)
        else onClose()
      } else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ' && !mosaic && !inpaint) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, mosaic, inpaint, onClose])

  // load the current image into the canvas when entering mosaic / inpaint mode
  useEffect(() => {
    if ((!mosaic && !inpaint) || !cur) return
    let alive = true
    api.generations.imageData(cur.id).then((dataUrl) => {
      if (!alive) return
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')?.drawImage(img, 0, 0)
        // inpaint: a transparent mask layer the same size as the image. Reset it
        // on a fresh entry or a size change; otherwise (the reload after a re-描画)
        // keep the painted region so the same area can be redrawn repeatedly.
        const mask = maskRef.current
        if (inpaint && mask) {
          const sizeChanged = mask.width !== img.naturalWidth || mask.height !== img.naturalHeight
          if (resetMaskRef.current || sizeChanged) {
            mask.width = img.naturalWidth
            mask.height = img.naturalHeight
            mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height)
            resetMaskRef.current = false
          }
        }
      }
      img.src = dataUrl
    })
    return () => {
      alive = false
    }
  }, [mosaic, inpaint, cur])

  // Load the current character / situation prompts when the editor opens.
  useEffect(() => {
    if (!editOpen || !cur) return
    let alive = true
    setEditLoading(true)
    Promise.all([
      cur.character_id ? api.characters.get(cur.character_id) : Promise.resolve(null),
      cur.situation_id ? api.situations.get(cur.situation_id) : Promise.resolve(null)
    ]).then(([c, s]) => {
      if (!alive) return
      setCharPrompt(c?.prompt ?? '')
      setSitPrompt(s?.prompt ?? '')
      setEditLoading(false)
    })
    return () => {
      alive = false
    }
  }, [editOpen, cur?.id, cur?.character_id, cur?.situation_id])

  if (!cur) return null

  // map a pointer event to canvas pixel coordinates
  function toCanvasXY(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    }
  }

  function onPointerDown(e: React.PointerEvent): void {
    if (!mosaic) return
    dragRef.current = toCanvasXY(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerUp(e: React.PointerEvent): void {
    if (!mosaic || !dragRef.current) return
    const start = dragRef.current
    dragRef.current = null
    const end = toCanvasXY(e)
    const x = Math.round(Math.min(start.x, end.x))
    const y = Math.round(Math.min(start.y, end.y))
    const w = Math.round(Math.abs(end.x - start.x))
    const h = Math.round(Math.abs(end.y - start.y))
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) applyFineMosaic(ctx, canvas, x, y, w, h)
  }

  // ---- inpaint mask brush ----
  function maskXY(e: React.PointerEvent): { x: number; y: number } {
    const m = maskRef.current!
    const rect = m.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * m.width,
      y: ((e.clientY - rect.top) / rect.height) * m.height
    }
  }
  function paintStroke(from: { x: number; y: number } | null, to: { x: number; y: number }): void {
    const ctx = maskRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'
    ctx.lineCap = 'round'
    ctx.lineWidth = brush
    ctx.beginPath()
    ctx.arc(to.x, to.y, brush / 2, 0, Math.PI * 2)
    ctx.fill()
    if (from) {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
  }
  function maskDown(e: React.PointerEvent): void {
    const p = maskXY(e)
    paintRef.current = p
    paintStroke(null, p)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function maskMove(e: React.PointerEvent): void {
    // Always update the brush-size preview ring (in screen px) under the cursor.
    const m = maskRef.current
    if (m) {
      const rect = m.getBoundingClientRect()
      setCursor({ x: e.clientX, y: e.clientY, d: (brush * rect.width) / m.width })
    }
    if (!paintRef.current) return
    const p = maskXY(e)
    paintStroke(paintRef.current, p)
    paintRef.current = p
  }
  function maskUp(): void {
    paintRef.current = null
  }
  function clearMask(): void {
    const m = maskRef.current
    m?.getContext('2d')?.clearRect(0, 0, m.width, m.height)
  }

  async function runInpaint(): Promise<void> {
    const mask = maskRef.current
    if (!mask) return
    // require some painted area
    const data = mask.getContext('2d')?.getImageData(0, 0, mask.width, mask.height).data
    if (!data || !data.some((_, i) => i % 4 === 3 && data[i] > 0)) {
      toast.error('再描画する範囲を塗ってください')
      return
    }
    setBusy(true)
    try {
      // NAI v4 snaps the mask to the 8px latent grid (resize_to_naimask): downscale
      // ×1/8 then back up ×8 with nearest. Doing this binarizes per-block, killing
      // the anti-aliased gray edges that left a seam. Output = white (redraw) on
      // transparent, matching NAI's mask format.
      const sw = Math.max(1, Math.round(mask.width / 8))
      const sh = Math.max(1, Math.round(mask.height / 8))
      const small = document.createElement('canvas')
      small.width = sw
      small.height = sh
      const sctx = small.getContext('2d')
      if (!sctx) throw new Error('canvas が使えません')
      sctx.imageSmoothingEnabled = false
      sctx.drawImage(mask, 0, 0, sw, sh)

      const out = document.createElement('canvas')
      out.width = mask.width
      out.height = mask.height
      const octx = out.getContext('2d')
      if (!octx) throw new Error('canvas が使えません')
      octx.imageSmoothingEnabled = false
      octx.drawImage(small, 0, 0, out.width, out.height)
      const id = octx.getImageData(0, 0, out.width, out.height)
      const px = id.data
      for (let i = 0; i < px.length; i += 4) {
        const painted = px[i + 3] > 32 // any painted alpha in this block
        px[i] = px[i + 1] = px[i + 2] = painted ? 255 : 0
        px[i + 3] = painted ? 255 : 0
      }
      octx.putImageData(id, 0, 0)
      const prev = await api.generations.imageData(cur.id)
      await api.generations.inpaint(cur.id, out.toDataURL('image/png'), inpaintPrompt.trim())
      // Stay in inpaint mode with the mask intact (resetMaskRef stays false) so the
      // image reloads to show the result while the same region can be redrawn again.
      onChanged()
      setUndoData(prev)
      toast.success('部分再描画しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function regenerate(): Promise<void> {
    setBusy(true)
    try {
      // capture the current image bytes first so we can undo this one step
      const prev = await api.generations.imageData(cur.id)
      await api.generations.regenerate(cur.id)
      onChanged()
      setUndoData(prev)
      toast.success('再生成しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function undo(): Promise<void> {
    if (!undoData) return
    setBusy(true)
    try {
      await api.generations.saveImage(cur.id, undoData)
      onChanged()
      setUndoData(null)
      toast.success('元に戻しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Revert to the backed-up pre-edit original (e.g. an unwanted auto-mosaic).
  async function restoreOriginal(): Promise<void> {
    setBusy(true)
    try {
      await api.generations.restoreOriginal(cur.id)
      onChanged()
      setUndoData(null)
      toast.success('編集前の画像に戻しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Persist edited prompts back to the source character & situation records,
  // then optionally regenerate this image with the updated prompts.
  async function saveEdits(thenRegen: boolean): Promise<void> {
    setBusy(true)
    try {
      if (cur.character_id) await api.characters.update(cur.character_id, { prompt: charPrompt })
      if (cur.situation_id) await api.situations.update(cur.situation_id, { prompt: sitPrompt })
      if (thenRegen) {
        const prev = await api.generations.imageData(cur.id)
        await api.generations.regenerate(cur.id)
        onChanged()
        setUndoData(prev)
        toast.success('更新して再生成しました')
      } else {
        toast.success('プロンプトを更新しました')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function genDialogue(): Promise<void> {
    setDlgBusy(true)
    try {
      await api.generations.generateDialogue(cur.id)
      onChanged()
      toast.success('セリフを生成しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDlgBusy(false)
    }
  }

  function saveDialogue(): void {
    if (dialogue === (cur.dialogue ?? '')) return
    api.generations.setDialogue(cur.id, dialogue).then(() => onChanged())
  }

  // Burn the dialogue onto the image as a speech bubble, auto-placed on the
  // background (u2netp segmentation) so it avoids the subject/skin. Falls back to
  // a bottom caption band for close-ups with no clear background. Revertible via
  // the pre-edit original backup ("編集前に戻す").
  async function burnDialogue(): Promise<void> {
    const text = (dialogue || cur.dialogue || '').trim()
    if (!text) {
      toast.error('セリフがありません（先に生成/入力してください）')
      return
    }
    setBusy(true)
    try {
      const img = await loadImage(await api.generations.imageData(cur.id))
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas が使えません')
      ctx.drawImage(img, 0, 0)

      const layout = measureBubble(ctx, text, canvas.width)
      const place = await api.generations.placeBubble(cur.id, layout.w, layout.h)
      if (place.found) {
        drawBubble(ctx, layout, place.x, place.y, { x: place.tailX, y: place.tailY })
      } else {
        drawCaptionBand(ctx, canvas.width, canvas.height, text)
      }
      await api.generations.saveImage(cur.id, canvas.toDataURL('image/png'))
      onChanged()
      toast.success(place.found ? 'セリフを吹き出しで配置しました' : 'セリフを下部に表示しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // auto-detect genitals and blur each box (user can still tweak / add manually)
  async function autoDetect(): Promise<void> {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    setBusy(true)
    try {
      const boxes = await api.generations.detectCensor(cur.id)
      if (!boxes.length) {
        toast.push('検出なし — 手動で囲ってください')
        return
      }
      for (const b of boxes) applyFineMosaic(ctx, canvas, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
      toast.success(`${boxes.length}か所を自動モザイク`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveMosaic(): Promise<void> {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      await api.generations.saveImage(cur.id, dataUrl)
      onChanged()
      setMosaic(false)
      toast.success('モザイクを保存しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="force-dark fixed inset-0 z-[70] flex flex-col bg-black/95">
      {/* top bar — no-drag so clicks reach it inside the title-bar strip; pl to
          clear the macOS traffic lights */}
      <div className="no-drag flex items-center gap-3 py-2 pl-24 pr-4 text-ink-300">
        <span className="text-sm">
          {idx + 1} / {generations.length}
        </span>
        <span className="truncate text-xs text-ink-500">
          {[cur.character_name, cur.situation_name].filter(Boolean).join(' / ')}
        </span>
        <button onClick={onClose} className="ml-auto rounded p-1 hover:bg-white/10" title="閉じる (Esc)">
          <X size={20} />
        </button>
      </div>

      {/* image / canvas */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
        {!mosaic && !inpaint && (
          <button
            onClick={() => go(-1)}
            className="absolute left-2 rounded-full bg-white/10 p-2 text-ink-200 hover:bg-white/20"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {mosaic ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            className="max-h-full max-w-full cursor-crosshair touch-none rounded"
          />
        ) : inpaint ? (
          // image canvas scales like the mosaic one (direct child, max-h/max-w);
          // the mask canvas overlays it via absolute + margin:auto centering at the
          // same max-constrained size. No clipping, so the whole image is reachable.
          <>
            <canvas ref={canvasRef} className="max-h-full max-w-full rounded" />
            <canvas
              ref={maskRef}
              onPointerDown={maskDown}
              onPointerMove={maskMove}
              onPointerUp={maskUp}
              onPointerLeave={() => setCursor(null)}
              className="absolute inset-0 m-auto max-h-full max-w-full cursor-crosshair touch-none rounded opacity-50"
            />
            {cursor && (
              <div
                className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white mix-blend-difference"
                style={{ left: cursor.x, top: cursor.y, width: cursor.d, height: cursor.d }}
              />
            )}
          </>
        ) : (
          <img src={cur.image_url ?? ''} className="max-h-full max-w-full rounded object-contain" />
        )}
        {!mosaic && !inpaint && (
          <button
            onClick={() => go(1)}
            className="absolute right-2 rounded-full bg-white/10 p-2 text-ink-200 hover:bg-white/20"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* per-image dialogue */}
      {!mosaic && !inpaint && (
        <div className="flex items-center gap-2 border-t border-ink-700 bg-ink-900/80 px-6 py-2">
          <span className="shrink-0 text-xs text-ink-500">セリフ</span>
          <input
            value={dialogue}
            onChange={(e) => setDialogue(e.target.value)}
            onBlur={saveDialogue}
            placeholder="未生成 —「生成」で作成（手入力も可）"
            className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
          <button
            onClick={genDialogue}
            disabled={busy || dlgBusy}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10 disabled:opacity-50"
          >
            {dlgBusy ? <Loader2 size={14} className="animate-spin" /> : null}
            {dlgBusy ? '生成中…' : cur.dialogue ? '再生成' : '生成'}
          </button>
          <button
            onClick={burnDialogue}
            disabled={busy || dlgBusy}
            title="セリフを吹き出しとして画像に焼き込む（背景に自動配置）"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquareText size={14} />}
            画像に表示
          </button>
        </div>
      )}

      {/* prompt editor (updates the source character & situation) */}
      {editOpen && !mosaic && (
        <div className="border-t border-ink-700 bg-ink-900/95 px-6 py-3">
          {editLoading ? (
            <div className="py-2 text-xs text-ink-500">読み込み中…</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-500">
                  キャラクタープロンプト
                  {!cur.character_id && '（キャラ削除済み・編集不可）'}
                </span>
                <textarea
                  value={charPrompt}
                  onChange={(e) => setCharPrompt(e.target.value)}
                  disabled={!cur.character_id}
                  rows={3}
                  className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-500">
                  シチュエーションプロンプト
                  {!cur.situation_id && '（シチュ削除済み・編集不可）'}
                </span>
                <textarea
                  value={sitPrompt}
                  onChange={(e) => setSitPrompt(e.target.value)}
                  disabled={!cur.situation_id}
                  rows={3}
                  className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60 disabled:opacity-50"
                />
              </label>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="mr-auto text-[11px] text-ink-500">
              元のキャラ／シチュのプロンプトを更新します（他の生成にも反映されます）
            </span>
            <button
              onClick={() => saveEdits(false)}
              disabled={busy || editLoading}
              className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10 disabled:opacity-50"
            >
              保存
            </button>
            <button
              onClick={() => saveEdits(true)}
              disabled={busy || editLoading}
              className="rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30 disabled:opacity-50"
            >
              保存して再生成
            </button>
          </div>
        </div>
      )}

      {/* controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-3">
        {mosaic ? (
          <>
            <span className="mr-2 text-xs text-ink-500">ドラッグで囲む（FINE）／自動検出で局部を一括</span>
            <button
              onClick={autoDetect}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={15} />} 自動検出
            </button>
            <button
              onClick={saveMosaic}
              disabled={busy}
              className="rounded-md bg-accent/20 px-4 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30 disabled:opacity-50"
            >
              保存
            </button>
            <button
              onClick={() => setMosaic(false)}
              className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/10"
            >
              キャンセル
            </button>
          </>
        ) : inpaint ? (
          <div className="flex w-full max-w-4xl items-center gap-2">
            <input
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
              placeholder="塗った範囲に描く内容（任意・英語タグ。例: open mouth）"
              className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
            />
            <label className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
              太さ
              <input
                type="range"
                min={8}
                max={160}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
              />
            </label>
            <button
              onClick={runInpaint}
              disabled={busy}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent/20 px-4 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} 再描画
            </button>
            <button
              onClick={clearMask}
              disabled={busy}
              className="shrink-0 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/10"
            >
              クリア
            </button>
            <button
              onClick={() => setInpaint(false)}
              className="shrink-0 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-white/10"
            >
              完了
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10"
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? '停止' : 'スライドショー'}
            </button>
            <button
              onClick={regenerate}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> 再生成
            </button>
            <button
              onClick={() => setEditOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-white/10 ${
                editOpen ? 'border-accent/50 text-accent' : 'border-ink-600 text-ink-200'
              }`}
            >
              <Pencil size={15} /> プロンプト編集
            </button>
            {undoData ? (
              <button
                onClick={undo}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-accent/50 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                <Undo2 size={15} /> 元に戻す
              </button>
            ) : (
              cur.has_original && (
                <button
                  onClick={restoreOriginal}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md border border-accent/50 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
                  title="モザイク/再描画/セリフ表示前のオリジナルに戻す"
                >
                  <Undo2 size={15} /> 編集前に戻す
                </button>
              )
            )}
            <button
              onClick={() => {
                setPlaying(false)
                setEditOpen(false)
                setMosaic(true)
              }}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10"
            >
              <SquareDashedMousePointer size={15} /> モザイク
            </button>
            <button
              onClick={() => {
                setPlaying(false)
                setEditOpen(false)
                setInpaintPrompt('')
                resetMaskRef.current = true // fresh mask on entry
                setCursor(null)
                setInpaint(true)
              }}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-white/10"
            >
              <Paintbrush size={15} /> 部分再描画
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
