import { useCallback, useEffect, useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import type { ArticleListItem } from '@shared/types'
import { api } from '../api'
import { useToast } from '../components/Toast'
import ArticlePreview from '../components/ArticlePreview'

export default function Articles(): JSX.Element {
  const toast = useToast()
  const [items, setItems] = useState<ArticleListItem[] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)

  const reload = useCallback(() => {
    api.articles.list().then(setItems)
  }, [])

  useEffect(() => reload(), [reload])

  async function remove(it: ArticleListItem): Promise<void> {
    if (!confirm(`「${it.title}」を削除しますか？`)) return
    await api.articles.delete(it.id)
    toast.success('削除しました')
    reload()
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="mb-4 text-lg font-semibold">保存した記事</h1>
      {!items ? (
        <p className="text-sm text-ink-500">読み込み中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-600 py-16 text-center text-ink-500">
          保存した記事はまだありません（ギャラリーの「記事作成」→「保存」で作れます）
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800/40 px-4 py-3"
            >
              <FileText size={16} className="shrink-0 text-ink-500" />
              <button
                onClick={() => setEditing(it.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-sm text-ink-100">{it.title || '無題'}</div>
                <div className="text-[11px] text-ink-500">{it.updated_at}</div>
              </button>
              <button
                onClick={() => setEditing(it.id)}
                className="rounded-md border border-ink-600 px-3 py-1 text-xs text-ink-200 hover:border-accent/60 hover:text-accent"
              >
                編集
              </button>
              <button
                onClick={() => remove(it)}
                className="rounded-md p-1 text-ink-500 hover:text-red-300"
                title="削除"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <ArticlePreview
          articleId={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
