import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { CharacterListItem, Tag } from '@shared/types'

interface Props {
  characters: CharacterListItem[]
  tags: Tag[]
  value: number | null
  onChange: (id: number) => void
}

// Single-select character grid with free-word search + tag filtering (the list
// is large). Used for story-mode batch character selection.
export default function CharacterCardGrid({ characters, tags, value, onChange }: Props): JSX.Element {
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

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キャラを検索"
          className="w-full rounded-md border border-ink-600 bg-ink-900 py-2 pl-8 pr-3 text-sm outline-none focus:border-accent/60"
        />
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
              <X size={11} /> 解除
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-ink-700 bg-ink-900/40 px-2 py-3 text-center text-xs text-ink-600">
          該当するキャラがいません
        </div>
      ) : (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-2 sm:grid-cols-4">
          {filtered.map((c) => {
            const on = c.id === value
            return (
              <button
                key={c.id}
                onClick={() => onChange(c.id)}
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
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/90 to-transparent p-1.5 pt-5">
                  <span className="block truncate text-[10px] text-ink-50">{c.name}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
