import { useState } from 'react'
import { ChevronDown, Download, FileText, Loader2, MessageSquare, Trash2, TriangleAlert } from 'lucide-react'
import type { Batch, BatchStatus, Generation } from '@shared/types'
import { api, useBatches } from '../api'
import { useToast } from '../components/Toast'
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
      <div className="flex aspect-[2/3] items-center justify-center rounded-md border border-ink-700 bg-ink-900 text-ink-600">
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

  const toggleExpand = (id: number): void =>
    setExpanded((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
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

  async function genDialogues(b: Batch): Promise<void> {
    try {
      await api.batches.generateDialogues(b.id) // background; list polls for progress
      mutate()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(b: Batch): Promise<void> {
    if (!confirm(`バッチ「${b.name}」と生成画像を削除しますか？`)) return
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
        <div className="rounded-lg border border-dashed border-ink-600 py-20 text-center text-ink-600">
          まだ生成バッチがありません。「一括生成」から作成してください。
        </div>
      ) : (
        <div className="space-y-3">
          {(batches ?? []).map((b) => {
            const success = successOf(b)
            const open = expanded.has(b.id)
            const cover = success.find((g) => g.thumbnail_url)?.thumbnail_url ?? null
            return (
              <section key={b.id} className="overflow-hidden rounded-xl border border-ink-700 bg-ink-800/40">
                {/* collapsed card header — click to expand */}
                <button
                  onClick={() => toggleExpand(b.id)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink-800/60"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-ink-800">
                    {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-ink-100">{b.name}</h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                          b.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : b.status === 'failed'
                              ? 'bg-red-500/15 text-red-300'
                              : b.status === 'processing' || b.status === 'pending'
                                ? 'bg-accent/15 text-accent'
                                : 'bg-ink-700 text-ink-400'
                        }`}
                      >
                        {STATUS_LABEL[b.status]} {b.done_count}/{b.total}
                      </span>
                    </div>
                    <span className="text-xs text-ink-500">
                      {b.type === 'scene'
                        ? `[${b.character_tag_name || '?'}] × ${b.story_name || '?'}`
                        : `${b.character_name || '?'} × ${b.story_name || '?'}`}
                      {success.length > 0 && ` ・ ${success.length}枚`}
                    </span>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
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
                        <div className="ml-auto flex items-center gap-1.5">
                          {success.length > 1 && (
                            <button
                              onClick={() => setViewer({ batchId: b.id, index: 0 })}
                              className="rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent"
                            >
                              スライドショー
                            </button>
                          )}
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
                          <button
                            onClick={() => setArticleBatch(b.id)}
                            disabled={success.length === 0}
                            className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
                          >
                            <FileText size={14} /> 記事作成
                          </button>
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
