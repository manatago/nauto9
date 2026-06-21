import { useMemo, useState } from 'react'
import { Plus, Search, UserPlus } from 'lucide-react'
import { api, useCharacters, useTags } from '../api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'

interface Props {
  onOpen: (id: number) => void
}

type Sort = 'newest' | 'name' | 'outfits'

export default function CharacterList({ onOpen }: Props): JSX.Element {
  const toast = useToast()
  const { data: characters, mutate } = useCharacters()
  const { data: tags, mutate: mutateTags } = useTags()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [filterTags, setFilterTags] = useState<number[]>([])
  const [editTags, setEditTags] = useState(false)

  async function deleteTag(id: number, name: string): Promise<void> {
    if (!confirm(`タグ「${name}」を削除しますか？\n（このタグはすべてのキャラクターから外れます）`)) return
    await api.tags.delete(id)
    setFilterTags((ids) => ids.filter((x) => x !== id))
    mutateTags()
    mutate() // character tag chips may change
    toast.success('タグを削除しました')
  }
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')

  const filtered = useMemo(() => {
    let list = characters ?? []
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q))
    if (filterTags.length)
      list = list.filter((c) => filterTags.every((tid) => c.tags.some((t) => t.id === tid)))
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'outfits') sorted.sort((a, b) => b.image_count - a.image_count)
    else sorted.sort((a, b) => b.id - a.id)
    return sorted
  }, [characters, query, filterTags, sort])

  async function create(): Promise<void> {
    if (!newName.trim()) return
    try {
      const c = await api.characters.create({ name: newName.trim(), prompt: newPrompt })
      setCreating(false)
      setNewName('')
      setNewPrompt('')
      mutate()
      onOpen(c.id)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold">キャラクター</h1>
        <span className="text-sm text-ink-500">{filtered.length}</span>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
        >
          <UserPlus size={16} /> 新規キャラ
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-ink-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前で検索"
            className="rounded-md border border-ink-600 bg-ink-900 py-2 pl-8 pr-3 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-md border border-ink-600 bg-ink-900 px-2 py-2 text-sm text-ink-300"
        >
          <option value="newest">新着順</option>
          <option value="name">名前順</option>
          <option value="outfits">画像数順</option>
        </select>
        {(tags ?? []).map((t) => {
          const on = filterTags.includes(t.id)
          return (
            <span
              key={t.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                on ? 'bg-accent/20 text-accent ring-1 ring-accent/50' : 'bg-ink-700 text-ink-300'
              }`}
            >
              <button
                onClick={() =>
                  setFilterTags((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))
                }
              >
                {t.name}
              </button>
              {editTags && (
                <button
                  onClick={() => deleteTag(t.id, t.name)}
                  title="タグを削除"
                  className="-mr-1 rounded-full px-1 text-ink-400 hover:bg-red-500/20 hover:text-red-300"
                >
                  ×
                </button>
              )}
            </span>
          )
        })}
        {(tags ?? []).length > 0 && (
          <button
            onClick={() => setEditTags((v) => !v)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              editTags ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40' : 'text-ink-500 hover:text-ink-200'
            }`}
          >
            {editTags ? 'タグ編集を終了' : 'タグ編集'}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-600 py-20 text-center text-ink-600">
          キャラクターがいません。「新規キャラ」から作成してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="group overflow-hidden rounded-xl border border-ink-700 bg-ink-800 text-left hover:border-accent/50"
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-ink-900">
                {c.thumbnail_url ? (
                  <img
                    src={c.thumbnail_url}
                    className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-700">
                    <Plus size={28} />
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <div className="truncate text-sm font-medium text-ink-100">{c.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                  <span>{c.image_count} 枚</span>
                  {c.tags.slice(0, 2).map((t) => (
                    <span key={t.id} className="rounded bg-ink-700 px-1.5 py-0.5 text-ink-400">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={creating} title="新規キャラクター" onClose={() => setCreating(false)}>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">名前</span>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">ベースプロンプト（任意）</span>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              rows={3}
              placeholder="1girl, long black hair, blue eyes"
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <p className="text-xs text-ink-600">
            作成後、詳細画面で参照画像（vibe）を登録できます。衣装違いは別キャラとして作るのがおすすめです。
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-700"
            >
              キャンセル
            </button>
            <button
              onClick={create}
              className="rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
            >
              作成
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
