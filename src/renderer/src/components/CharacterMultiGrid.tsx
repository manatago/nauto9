import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { CharacterListItem, Tag } from '@shared/types'

interface Props {
  characters: CharacterListItem[]
  tags: Tag[]
  value: number[]
  onChange: (ids: number[]) => void
}

// Multi-select character grid with search + tag filtering. The "表示中を全選択"
// button bulk-(de)selects whatever is currently shown — so filtering by a tag
// then全選択 is the "pick a whole tag at once" path, while clicking individual
// cards is manual selection. The selection persists across filter changes.
export default function CharacterMultiGrid({ characters, tags, value, onChange }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [filterTags, setFilterTags] = useState<number[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return characters.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false
      if (filterTags.length && !filterTags.every((tid) => c.tags.some((t) => t.id === tid)))
        return false
      return true
    })
  }, [characters, query, filterTags])

  const sel = new Set(value)
  const filteredIds = filtered.map((c) => c.id)
  const allShownSelected = filteredIds.length > 0 && filteredIds.every((id) => sel.has(id))

  const toggle = (id: number): void =>
    onChange(sel.has(id) ? value.filter((x) => x !== id) : [...value, id])

  const bulkShown = (): void => {
    if (allShownSelected) onChange(value.filter((id) => !filteredIds.includes(id)))
    else onChange([...new Set([...value, ...filteredIds])])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="キャラを検索"
            className="w-full rounded-md border border-ink-600 bg-ink-900 py-2 pl-8 pr-3 text-sm outline-none focus:border-accent/60"
          />
        </div>
        <button
          onClick={bulkShown}
          disabled={filteredIds.length === 0}
          className="shrink-0 rounded-md border border-ink-600 px-2.5 py-2 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
        >
          {allShownSelected ? '表示中を全解除' : '表示中を全選択'}
        </button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => {
            const on = filterTags.includes(t.id)
            return (
              <button
                key={t.id}
                onClick={() =>
                  setFilterTags((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))
                }
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  on ? 'bg-accent/20 text-accent ring-1 ring-accent/50' : 'bg-ink-700 text-ink-300'
                }`}
              >
                {t.name}
              </button>
            )
          })}
          {filterTags.length > 0 && (
            <button
              onClick={() => setFilterTags([])}
              className="flex items-center gap-0.5 text-xs text-ink-500 hover:text-ink-200"
            >
              <X size={11} /> 絞り込み解除
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-ink-700 bg-ink-900/40 px-2 py-3 text-center text-xs text-ink-500">
          該当するキャラがいません
        </div>
      ) : (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-2 sm:grid-cols-4">
          {filtered.map((c) => {
            const on = sel.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`group relative aspect-[3/4] overflow-hidden rounded-lg border ${
                  on ? 'border-accent ring-2 ring-accent/60' : 'border-ink-700 hover:border-ink-500'
                }`}
              >
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-ink-800" />
                )}
                {on && (
                  <div className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-ink-900">
                    <Check size={12} />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-5">
                  <span className="block truncate text-[10px] text-white">{c.name}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
