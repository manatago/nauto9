import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Save, Upload } from 'lucide-react'
import type { Article, ArticleBlock } from '@shared/types'
import { api } from '../api'
import { useToast } from './Toast'
import Modal from './Modal'

// Convert a (PNG) data URL to a webp data URL using the browser canvas encoder.
async function toWebp(dataUrl: string, quality = 0.9): Promise<string> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas が使えません')
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/webp', quality)
}

interface Props {
  batchId?: number // compose a fresh article from this batch
  articleId?: number // or load a saved article to edit
  onClose: () => void
  onSaved?: () => void
}

// Compose / load + preview a WordPress draft. Text is editable inline, each piece
// can be regenerated, and the whole article can be saved or posted as a draft.
export default function ArticlePreview({
  batchId,
  articleId,
  onClose,
  onSaved
}: Props): JSX.Element {
  const toast = useToast()
  const [article, setArticle] = useState<Article | null>(null)
  const [savedId, setSavedId] = useState<number | null>(articleId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 'title' | 'intro' | block id
  const [posting, setPosting] = useState<string | null>(null) // progress label while posting
  const [saving, setSaving] = useState(false)
  const [ads, setAds] = useState<string[]>([])

  useEffect(() => {
    api.settings.get('AD_LINKS').then((v) => {
      try {
        const arr = JSON.parse(v || '[]')
        setAds(Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()) : [])
      } catch {
        setAds([])
      }
    })
  }, [])

  function pickAd(current: string): string {
    if (!ads.length) {
      toast.error('広告リンクが登録されていません（設定 → 広告リンク）')
      return current
    }
    return ads[Math.floor(Math.random() * ads.length)]
  }

  useEffect(() => {
    let alive = true
    setArticle(null)
    setError(null)
    const load = articleId
      ? api.articles.get(articleId).then((a) => {
          if (!a) throw new Error('記事が見つかりません')
          return { batch_id: a.batch_id, title: a.title, intro: a.intro, blocks: a.blocks }
        })
      : api.articles.compose(batchId as number)
    load.then((a) => alive && setArticle(a)).catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [batchId, articleId])

  async function save(): Promise<void> {
    if (!article) return
    setSaving(true)
    try {
      const r = await api.articles.save({
        id: savedId ?? undefined,
        batch_id: article.batch_id,
        title: article.title,
        intro: article.intro,
        blocks: article.blocks
      })
      setSavedId(r.id)
      onSaved?.()
      toast.success('保存しました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

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

  async function post(): Promise<void> {
    if (!article) return
    try {
      const imageBlocks = article.blocks.filter(
        (b) => b.kind === 'image' && b.generation_id != null
      )
      const images: { generation_id: number; data_url: string; filename: string }[] = []
      for (let i = 0; i < imageBlocks.length; i++) {
        const b = imageBlocks[i]
        setPosting(`画像変換 ${i + 1}/${imageBlocks.length}`)
        const png = await api.generations.imageData(b.generation_id as number)
        images.push({
          generation_id: b.generation_id as number,
          data_url: await toWebp(png),
          filename: `nauto9-${b.generation_id}.webp`
        })
      }
      setPosting('WordPressへ送信中…')
      const res = await api.articles.post({
        title: article.title,
        intro: article.intro,
        blocks: article.blocks,
        images
      })
      toast.success(`下書きを作成しました: ${res.link}`)
      window.open(res.link, '_blank')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPosting(null)
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
        <figure key={b.id} className="my-2 space-y-1">
          {b.image_url && (
            <img src={b.image_url} className="mx-auto max-h-[40vh] rounded-lg" alt={b.text} />
          )}
          <input
            value={b.text}
            onChange={(e) => setBlock(b.id, e.target.value)}
            placeholder="alt（画像名）"
            className="mx-auto block w-full max-w-md rounded-md border border-ink-700 bg-ink-900 px-2 py-0.5 text-center text-[11px] text-ink-400 outline-none focus:border-accent/60"
          />
        </figure>
      )
    if (b.kind === 'customHtml')
      return (
        <div key={b.id} className="flex items-start gap-2">
          <span className="mt-1.5 w-10 shrink-0 text-[10px] uppercase text-ink-600">広告</span>
          <textarea
            value={b.text}
            onChange={(e) => setBlock(b.id, e.target.value)}
            rows={3}
            className="flex-1 resize-y rounded-md border border-amber-700/50 bg-ink-900 px-2 py-1 font-mono text-xs text-amber-200/90 outline-none focus:border-accent/60"
          />
          <RegenBtn k={b.id} fn={() => Promise.resolve(pickAd(b.text))} />
        </div>
      )
    const regenTarget =
      b.kind === 'dialogue'
        ? () => api.generations.generateDialogue(b.generation_id as number).then((g) => g.dialogue)
        : () =>
            api.articles.regenerate({
              batch_id: article?.batch_id ?? 0,
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
            <RegenBtn k="title" fn={() => api.articles.regenerate({ batch_id: article.batch_id ?? 0, target: 'title' })} />
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-10 shrink-0 text-[10px] uppercase text-ink-600">導入</span>
            <textarea
              value={article.intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={3}
              className="flex-1 resize-y rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-ink-200 outline-none focus:border-accent/60"
            />
            <RegenBtn k="intro" fn={() => api.articles.regenerate({ batch_id: article.batch_id ?? 0, target: 'intro' })} />
          </div>
          <hr className="border-ink-700" />
          {article.blocks.map(renderBlock)}
          <div className="flex items-center justify-end gap-3 border-t border-ink-700 pt-3">
            <span className="mr-auto text-[11px] text-ink-600">
              画像はwebpに変換して下書きとして投稿します
            </span>
            <button
              onClick={save}
              disabled={saving || posting !== null}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savedId ? '上書き保存' : '保存'}
            </button>
            <button
              onClick={post}
              disabled={posting !== null || busy !== null}
              className="flex items-center gap-1.5 rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30 disabled:opacity-40"
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {posting ?? 'WordPressに下書き投稿'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
