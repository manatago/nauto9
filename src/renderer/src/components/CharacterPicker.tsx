import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { CharacterListItem } from '@shared/types'

interface Props {
  characters: CharacterListItem[]
  value: number | null
  onChange: (id: number | null) => void
}

// Single-select character picker with free-word filtering (the list is large).
export default function CharacterPicker({ characters, value, onChange }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = characters.find((c) => c.id === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? characters.filter((c) => c.name.toLowerCase().includes(q)) : characters
    return list.slice(0, 100)
  }, [characters, query])

  return (
    <div className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-600" />
        <input
          value={open ? query : (selected?.name ?? '')}
          placeholder="キャラを検索 / 選択"
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="w-full rounded-md border border-ink-600 bg-ink-900 py-2 pl-8 pr-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-ink-600 bg-ink-800 shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ink-600">該当なし</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(c.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ink-700 ${
                  c.id === value ? 'text-accent' : 'text-ink-200'
                }`}
              >
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} className="h-7 w-6 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-7 w-6 shrink-0 rounded bg-ink-700" />
                )}
                <span className="truncate">{c.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
