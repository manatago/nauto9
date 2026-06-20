import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  SquareDashedMousePointer,
  Undo2,
  X
} from 'lucide-react'
import type { Generation } from '@shared/types'
import { api } from '../api'
import { useToast } from './Toast'

interface Props {
  generations: Generation[] // success images to navigate
  index: number
  onClose: () => void
  onChanged: () => void
}

// nauto8 FINE mosaic: feathered blur(12px) over the dragged region.
function applyFineMosaic(
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
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const cur = generations[idx]
  const go = useCallback(
    (d: number) => {
      if (mosaic) return
      setIdx((i) => (i + d + generations.length) % generations.length)
    },
    [generations.length, mosaic]
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
    if (!playing || mosaic) return
    const t = setInterval(() => setIdx((i) => (i + 1) % generations.length), 3000)
    return () => clearInterval(t)
  }, [playing, mosaic, generations.length])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Don't hijack keys while typing in a prompt field (space, arrows, etc.).
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') (mosaic ? setMosaic(false) : onClose())
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ' && !mosaic) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, mosaic, onClose])

  // load the current image into the canvas when entering mosaic mode
  useEffect(() => {
    if (!mosaic || !cur) return
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
      }
      img.src = dataUrl
    })
    return () => {
      alive = false
    }
  }, [mosaic, cur])

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
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95">
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 py-2 text-ink-300">
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
        {!mosaic && (
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
        ) : (
          <img src={cur.image_url ?? ''} className="max-h-full max-w-full rounded object-contain" />
        )}
        {!mosaic && (
          <button
            onClick={() => go(1)}
            className="absolute right-2 rounded-full bg-white/10 p-2 text-ink-200 hover:bg-white/20"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* per-image dialogue (local LLM) */}
      {!mosaic && (
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
            <span className="mr-auto text-[11px] text-ink-600">
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
            <span className="mr-2 text-xs text-ink-500">隠したい部分をドラッグで囲む（FINE）</span>
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
            {undoData && (
              <button
                onClick={undo}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-accent/50 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                <Undo2 size={15} /> 元に戻す
              </button>
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
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
