import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  MessageSquareText,
  Trash2,
  TriangleAlert,
  Wand2
} from 'lucide-react'
import type { Batch, BatchStatus, Generation } from '@shared/types'
import { api, useBatches } from '../api'
import { useToast } from '../components/Toast'
import { autoMosaicGeneration, burnNarrationGeneration } from '../lib/mosaic'
import GenerationViewer from '../components/GenerationViewer'
import ArticlePreview from '../components/ArticlePreview'

const STATUS_LABEL: Record<BatchStatus, string> = {
  pending: '待機中',
  processing: '生成中',
  completed: '完了',
  failed: '失敗',
  cancelled: '中止'
}

function GenCell({
  g,
  retrying,
  onOpen,
  onRetry
}: {
  g: Generation
  retrying: boolean
  onOpen: () => void
  onRetry: () => void
}): JSX.Element {
  if (g.status === 'pending')
    return (
      <div className="flex aspect-[2/3] items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-ink-500">
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  if (g.status === 'failed' || !g.thumbnail_url)
    return (
      <button
        onClick={onRetry}
        disabled={retrying}
        title={g.error ?? '再生成'}
        className="flex aspect-[2/3] flex-col items-center justify-center gap-1 rounded-md border border-red-500/30 bg-red-950/30 p-1 text-center text-[10px] text-red-300 hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        {retrying ? <Loader2 size={16} className="animate-spin" /> : <TriangleAlert size={16} />}
        {retrying ? '再生成中' : '失敗・再生成'}
      </button>
    )
  return (
    <button onClick={onOpen} className="overflow-hidden rounded-md border border-ink-700">
      <img src={g.thumbnail_url} className="aspect-[2/3] w-full object-cover hover:opacity-90" />
    </button>
  )
}

export default function Gallery(): JSX.Element {
  const toast = useToast()
  const { data: batches, mutate } = useBatches()
  const [viewer, setViewer] = useState<{ batchId: number; index: number } | null>(null)
  const [articleBatch, setArticleBatch] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState<number | null>(null)
  const [mosaicking, setMosaicking] = useState<{ id: number; done: number; total: number } | null>(
    null
  )
  const [narrating, setNarrating] = useState<{ id: number; done: number; total: number } | null>(null)

  const toggleExpand = (id: number): void =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const [retryingIds, setRetryingIds] = useState<number[]>([])

  const successOf = (b: Batch): Generation[] =>
    b.generations.filter((g) => g.status === 'success' && g.image_url)

  async function download(b: Batch): Promise<void> {
    setDownloading(b.id)
    try {
      const { saved } = await api.batches.download(b.id)
      if (saved) toast.success('ZIP を保存しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDownloading(null)
    }
  }

  // Detect genitals in every image of the batch and burn in a FINE mosaic.
  // Overwrites the original images (per-image undo is only in the single viewer).
  async function batchMosaic(b: Batch): Promise<void> {
    const gens = successOf(b)
    if (!gens.length) return
    if (!confirm(`「${b.name}」の ${gens.length} 枚を自動モザイクします。元画像は上書きされます。`))
      return
    setMosaicking({ id: b.id, done: 0, total: gens.length })
    let changed = 0
    try {
      for (let i = 0; i < gens.length; i++) {
        try {
          if ((await autoMosaicGeneration(gens[i].id)) > 0) changed++
        } catch (e) {
          console.error('auto-mosaic failed for', gens[i].id, e)
        }
        setMosaicking({ id: b.id, done: i + 1, total: gens.length })
      }
      mutate()
      toast.success(`${changed}/${gens.length} 枚にモザイクを適用しました`)
    } finally {
      setMosaicking(null)
    }
  }

  // Burn every image's dialogue as a bottom NARRATION band (enabled only when all
  // lines are filled). Overwrites originals (per-image undo is in the viewer).
  async function batchNarrate(b: Batch): Promise<void> {
    const gens = successOf(b)
    if (!gens.length) return
    if (!confirm(`「${b.name}」の ${gens.length} 枚にセリフを下部ナレーションで焼き込みます。元画像は上書きされます。`))
      return
    setNarrating({ id: b.id, done: 0, total: gens.length })
    let changed = 0
    try {
      for (let i = 0; i < gens.length; i++) {
        try {
          if (await burnNarrationGeneration(gens[i].id, gens[i].dialogue)) changed++
        } catch (e) {
          console.error('batch narration failed for', gens[i].id, e)
        }
        setNarrating({ id: b.id, done: i + 1, total: gens.length })
      }
      mutate()
      toast.success(`${changed}/${gens.length} 枚にセリフを表示しました`)
    } finally {
      setNarrating(null)
    }
  }

  async function genDialogues(b: Batch): Promise<void> {
    try {
      await api.batches.generateDialogues(b.id) // background; list polls for progress
      mutate()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(b: Batch): Promise<void> {
    if (!confirm(`バッチ「${b.name}」と生成画像・対応する記事を削除しますか？`)) return
    await api.batches.delete(b.id)
    if (viewer?.batchId === b.id) setViewer(null)
    mutate()
  }

  async function retry(g: Generation): Promise<void> {
    setRetryingIds((ids) => [...ids, g.id])
    try {
      await api.generations.regenerate(g.id)
      mutate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRetryingIds((ids) => ids.filter((x) => x !== g.id))
    }
  }

  // Live data for the viewer (so regenerate/mosaic results show immediately).
  const viewerBatch = viewer ? batches?.find((b) => b.id === viewer.batchId) : undefined
  const viewerGens = viewerBatch ? successOf(viewerBatch) : []

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <h1 className="mb-4 text-xl font-semibold">ギャラリー</h1>

      {(batches ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-600 py-20 text-center text-ink-500">
          まだ生成バッチがありません。「一括生成」から作成してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(batches ?? []).map((b) => {
            const success = successOf(b)
            const open = expanded.has(b.id)
            const cover = success.find((g) => g.thumbnail_url)?.thumbnail_url ?? null
            const statusBadge = (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                  b.status === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : b.status === 'failed'
                      ? 'bg-red-500/15 text-red-300'
                      : b.status === 'processing' || b.status === 'pending'
                        ? 'bg-accent/15 text-accent'
                        : 'bg-ink-700 text-ink-200'
                }`}
              >
                {STATUS_LABEL[b.status]} {b.done_count}/{b.total}
              </span>
            )
            const sceneChars =
              b.type === 'scene'
                ? b.character_tag_name ||
                  `${new Set(b.generations.map((g) => g.character_name).filter(Boolean)).size}キャラ`
                : ''
            const meta =
              (b.type === 'scene'
                ? `${sceneChars} × ${b.story_name || '?'}`
                : `${b.character_name || '?'} × ${b.story_name || '?'}`) +
              (success.length > 0 ? ` ・ ${success.length}枚` : '')
            return (
              <section
                key={b.id}
                className={`overflow-hidden rounded-xl border border-ink-700 bg-ink-800/40 ${
                  open ? 'sm:col-span-3 lg:col-span-4' : ''
                }`}
              >
                {/* header — collapsed: square card with the first image as a faded
                    background + overlaid text; expanded: a compact bar */}
                <button
                  onClick={() => toggleExpand(b.id)}
                  className={`relative w-full overflow-hidden text-left ${
                    open ? 'flex items-center gap-3 p-3 hover:bg-ink-800/60' : 'block aspect-square'
                  }`}
                >
                  {open ? (
                    <>
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-ink-800">
                        {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-sm font-semibold text-ink-100">{b.name}</h2>
                          {statusBadge}
                        </div>
                        <span className="text-xs text-ink-500">{meta}</span>
                      </div>
                      <ChevronDown size={18} className="shrink-0 rotate-180 text-ink-500" />
                    </>
                  ) : (
                    <>
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover opacity-70"
                        />
                      )}
                      {/* fixed-dark scrim (over an image, readable in both themes) */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-between p-3">
                        <div className="flex justify-end">{statusBadge}</div>
                        <div>
                          <div className="truncate text-sm font-semibold text-white drop-shadow">
                            {b.name}
                          </div>
                          <div className="truncate text-[11px] text-white/70 drop-shadow">{meta}</div>
                        </div>
                      </div>
                    </>
                  )}
                </button>

                {/* smooth expand (grid-rows 0fr→1fr) */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3">
                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
                        {b.prefix_prompt && (
                          <span
                            className="max-w-[40%] truncate rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-ink-300"
                            title={b.prefix_prompt}
                          >
                            先頭: {b.prefix_prompt}
                          </span>
                        )}
                        {/* primary actions, left-aligned in workflow order with arrows */}
                        <button
                          onClick={() => genDialogues(b)}
                          disabled={success.length === 0 || b.dialogue_running}
                          className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
                        >
                          <MessageSquare size={14} />{' '}
                          {b.dialogue_running
                            ? `生成中 ${b.dialogue_count}/${success.length}`
                            : 'セリフ一括生成'}
                        </button>
                        <ChevronRight size={14} className="shrink-0 text-ink-600" />
                        <button
                          onClick={() => batchMosaic(b)}
                          disabled={success.length === 0 || mosaicking !== null}
                          className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
                        >
                          {mosaicking?.id === b.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Wand2 size={14} />
                          )}
                          {mosaicking?.id === b.id
                            ? `モザイク ${mosaicking.done}/${mosaicking.total}`
                            : '一括モザイク'}
                        </button>
                        <ChevronRight size={14} className="shrink-0 text-ink-600" />
                        <button
                          onClick={() => batchNarrate(b)}
                          disabled={
                            success.length === 0 ||
                            !success.every((g) => g.dialogue.trim().length > 0) ||
                            narrating !== null
                          }
                          title="全画像のセリフを下部ナレーションで焼き込む（全セリフが埋まっていると押せます）"
                          className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
                        >
                          {narrating?.id === b.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <MessageSquareText size={14} />
                          )}
                          {narrating?.id === b.id
                            ? `表示 ${narrating.done}/${narrating.total}`
                            : 'セリフを画像に表示'}
                        </button>
                        <ChevronRight size={14} className="shrink-0 text-ink-600" />
                        <button
                          onClick={() => setArticleBatch(b.id)}
                          disabled={success.length === 0}
                          className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
                        >
                          <FileText size={14} /> 記事作成
                        </button>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => download(b)}
                            disabled={success.length === 0 || downloading === b.id}
                            className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
                          >
                            <Download size={14} /> {downloading === b.id ? '保存中…' : 'ZIP DL'}
                          </button>
                          <button
                            onClick={() => remove(b)}
                            className="rounded-md p-1 text-ink-500 hover:text-red-300"
                            title="削除"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                        {b.generations.map((g) => (
                          <GenCell
                            key={g.id}
                            g={g}
                            retrying={retryingIds.includes(g.id)}
                            onRetry={() => retry(g)}
                            onOpen={() => {
                              const i = success.findIndex((x) => x.id === g.id)
                              setViewer({ batchId: b.id, index: Math.max(0, i) })
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {viewer && viewerGens.length > 0 && (
        <GenerationViewer
          generations={viewerGens}
          index={Math.min(viewer.index, viewerGens.length - 1)}
          onClose={() => setViewer(null)}
          onChanged={mutate}
        />
      )}

      {articleBatch !== null && (
        <ArticlePreview batchId={articleBatch} onClose={() => setArticleBatch(null)} />
      )}
    </div>
  )
}
