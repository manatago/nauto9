import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { Article, ArticleBlock } from '@shared/types'
import { api } from '../api'
import { useToast } from './Toast'
import Modal from './Modal'

interface Props {
  batchId: number
  onClose: () => void
}

// Compose + preview a WordPress draft for one batch. Text is editable inline and
// each piece can be regenerated. (Posting is a later step.)
export default function ArticlePreview({ batchId, onClose }: Props): JSX.Element {
  const toast = useToast()
  const [article, setArticle] = useState<Article | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 'title' | 'intro' | block id

  useEffect(() => {
    let alive = true
    setArticle(null)
    setError(null)
    api.articles
      .compose(batchId)
      .then((a) => alive && setArticle(a))
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [batchId])

  const setTitle = (text: string): void => setArticle((a) => (a ? { ...a, title: text } : a))
  const setIntro = (text: string): void => setArticle((a) => (a ? { ...a, intro: text } : a))
  const setBlock = (id: string, text: string): void =>
    setArticle((a) =>
      a ? { ...a, blocks: a.blocks.map((b) => (b.id === id ? { ...b, text } : b)) } : a
    )

  async function regen(key: string, fn: () => Promise<string>): Promise<void> {
    setBusy(key)
    try {
      const text = await fn()
      if (key === 'title') setTitle(text)
      else if (key === 'intro') setIntro(text)
      else setBlock(key, text)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const RegenBtn = ({ k, fn }: { k: string; fn: () => Promise<string> }): JSX.Element => (
    <button
      onClick={() => regen(k, fn)}
      disabled={busy !== null}
      title="再生成"
      className="shrink-0 rounded-md border border-ink-600 p-1.5 text-ink-400 hover:border-accent/60 hover:text-accent disabled:opacity-40"
    >
      {busy === k ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
    </button>
  )

  function renderBlock(b: ArticleBlock): JSX.Element {
    if (b.kind === 'image')
      return (
        <figure key={b.id} className="my-2">
          {b.image_url && (
            <img src={b.image_url} className="mx-auto max-h-[40vh] rounded-lg" alt="" />
          )}
        </figure>
      )
    const regenTarget =
      b.kind === 'dialogue'
        ? () => api.generations.generateDialogue(b.generation_id as number).then((g) => g.dialogue)
        : () =>
            api.articles.regenerate({
              batch_id: batchId,
              target: b.kind === 'h2' ? 'h2' : 'chapterDesc',
              situation_id: b.situation_id
            })
    const cls =
      b.kind === 'h2'
        ? 'text-lg font-bold text-ink-100'
        : b.kind === 'dialogue'
          ? 'text-base font-semibold text-accent'
          : 'text-sm text-ink-300'
    return (
      <div key={b.id} className="flex items-start gap-2">
        <span className="mt-1.5 w-10 shrink-0 text-[10px] uppercase text-ink-600">
          {b.kind === 'h2' ? 'h2' : b.kind === 'dialogue' ? 'h3' : '説明'}
        </span>
        <textarea
          value={b.text}
          onChange={(e) => setBlock(b.id, e.target.value)}
          rows={b.kind === 'chapterDesc' ? 2 : 1}
          className={`flex-1 resize-y rounded-md border border-ink-700 bg-ink-900 px-2 py-1 outline-none focus:border-accent/60 ${cls}`}
        />
        <RegenBtn k={b.id} fn={regenTarget} />
      </div>
    )
  }

  return (
    <Modal open title="記事プレビュー" onClose={onClose} wide>
      {error ? (
        <p className="py-8 text-center text-sm text-red-300">{error}</p>
      ) : !article ? (
        <p className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500">
          <Loader2 size={16} className="animate-spin" /> 記事を生成中…
        </p>
      ) : (
        <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
          <div className="flex items-start gap-2">
            <span className="mt-2 w-10 shrink-0 text-[10px] uppercase text-ink-600">題</span>
            <input
              value={article.title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-lg font-bold outline-none focus:border-accent/60"
            />
            <RegenBtn k="title" fn={() => api.articles.regenerate({ batch_id: batchId, target: 'title' })} />
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-10 shrink-0 text-[10px] uppercase text-ink-600">導入</span>
            <textarea
              value={article.intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={3}
              className="flex-1 resize-y rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-ink-200 outline-none focus:border-accent/60"
            />
            <RegenBtn k="intro" fn={() => api.articles.regenerate({ batch_id: batchId, target: 'intro' })} />
          </div>
          <hr className="border-ink-700" />
          {article.blocks.map(renderBlock)}
          <p className="pt-2 text-center text-[11px] text-ink-600">
            WordPressへの投稿は次のステップで追加します。
          </p>
        </div>
      )}
    </Modal>
  )
}
