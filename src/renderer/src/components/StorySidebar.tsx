import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Story } from '@shared/types'

interface Props {
  stories: Story[]
  selectedId: number | null // null = すべて（横断）
  renamingId: number | null
  onSelect: (id: number | null) => void
  onAdd: () => void
  onStartRename: (id: number | null) => void
  onCommitRename: (id: number, name: string) => void
  onDelete: (story: Story) => void
}

export default function StorySidebar({
  stories,
  selectedId,
  renamingId,
  onSelect,
  onAdd,
  onStartRename,
  onCommitRename,
  onDelete
}: Props): JSX.Element {
  return (
    <aside className="w-60 shrink-0 space-y-1">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-300">ストーリー</h2>
        <button onClick={onAdd} className="rounded p-1 text-ink-400 hover:text-accent" title="ストーリー追加">
          <Plus size={16} />
        </button>
      </div>

      <button
        onClick={() => onSelect(null)}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
          selectedId === null ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:bg-ink-800'
        }`}
      >
        <Layers size={14} /> すべて（横断）
      </button>

      {stories.map((s) => (
        <div
          key={s.id}
          className={`group flex items-center rounded-md ${
            selectedId === s.id ? 'bg-ink-700' : 'hover:bg-ink-800'
          }`}
        >
          {renamingId === s.id ? (
            <input
              autoFocus
              defaultValue={s.name}
              onBlur={(e) => {
                onCommitRename(s.id, e.target.value.trim() || s.name)
                onStartRename(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="m-1 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm outline-none focus:border-accent/60"
            />
          ) : (
            <>
              <button
                onClick={() => onSelect(s.id)}
                className={`min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-sm ${
                  selectedId === s.id ? 'text-ink-100' : 'text-ink-300'
                }`}
              >
                {s.name}
                <span className="ml-1.5 text-[10px] text-ink-500">{s.situation_count}</span>
              </button>
              <button
                onClick={() => onStartRename(s.id)}
                className="hidden p-1 text-ink-500 hover:text-ink-200 group-hover:block"
                title="名前変更"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(s)}
                className="hidden p-1 pr-2 text-ink-500 hover:text-red-300 group-hover:block"
                title="削除"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      ))}
    </aside>
  )
}
