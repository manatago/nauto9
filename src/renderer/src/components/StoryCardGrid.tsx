import { Check, Layers } from 'lucide-react'
import type { Story } from '@shared/types'

interface Props {
  stories: Story[]
  value: number | null
  onChange: (id: number) => void
}

// Single-select story grid (cards with the story's representative image).
export default function StoryCardGrid({ stories, value, onChange }: Props): JSX.Element {
  if (stories.length === 0)
    return (
      <div className="rounded-md border border-ink-700 bg-ink-900/40 px-2 py-3 text-center text-xs text-ink-500">
        ストーリーがありません
      </div>
    )
  return (
    <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-2 sm:grid-cols-3">
      {stories.map((s) => {
        const on = s.id === value
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`group relative h-20 overflow-hidden rounded-lg border ${
              on ? 'border-accent ring-2 ring-accent/60' : 'border-ink-700 hover:border-ink-500'
            }`}
          >
            {s.thumbnail_url ? (
              <img src={s.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-ink-800 text-ink-500">
                <Layers size={20} />
              </div>
            )}
            {on && (
              <div className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-ink-900">
                <Check size={12} />
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-5">
              <span className="block truncate text-[11px] font-medium text-white">{s.name}</span>
              <span className="text-[10px] text-white/70">{s.situation_count} 枚</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
