import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Tag } from '@shared/types'

interface Props {
  tags: Tag[]
  selected: number[]
  onToggle: (tagId: number, on: boolean) => void
  onCreate: (name: string) => void
}

export default function TagPicker({ tags, selected, onToggle, onCreate }: Props): JSX.Element {
  const [adding, setAdding] = useState('')

  function create(): void {
    if (!adding.trim()) return
    onCreate(adding.trim())
    setAdding('')
  }

  return (
    <div>
      <span className="mb-1 block text-xs text-ink-500">タグ</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const on = selected.includes(t.id)
          return (
            <button
              key={t.id}
              onClick={() => onToggle(t.id, on)}
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                on ? 'bg-accent/20 text-accent ring-1 ring-accent/50' : 'bg-ink-700 text-ink-300'
              }`}
            >
              {t.name}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="新規タグ"
          className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs outline-none focus:border-accent/60"
        />
        <button
          onClick={create}
          className="rounded-md border border-ink-600 px-2 text-xs text-ink-300 hover:bg-ink-700"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
