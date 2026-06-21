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

      {stories.map((s) =>
        renamingId === s.id ? (
          <input
            key={s.id}
            autoFocus
            defaultValue={s.name}
            onBlur={(e) => {
              onCommitRename(s.id, e.target.value.trim() || s.name)
              onStartRename(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm outline-none focus:border-accent/60"
          />
        ) : (
          <div
            key={s.id}
            className={`group relative overflow-hidden rounded-lg ring-1 ${
              selectedId === s.id ? 'ring-accent/60' : 'ring-ink-700 hover:ring-ink-500'
            }`}
          >
            <button onClick={() => onSelect(s.id)} className="block w-full text-left">
              <div className="relative h-16 w-full bg-ink-800">
                {s.thumbnail_url ? (
                  <img src={s.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-600">
                    <Layers size={20} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 to-transparent" />
                <div className="absolute bottom-1 left-2 right-2">
                  <div className="truncate text-sm font-medium text-ink-100 drop-shadow">{s.name}</div>
                  <div className="text-[10px] text-ink-300 drop-shadow">{s.situation_count} 枚</div>
                </div>
              </div>
            </button>
            <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
              <button
                onClick={() => onStartRename(s.id)}
                className="rounded bg-ink-900/70 p-1 text-ink-300 hover:text-ink-100"
                title="名前変更"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => onDelete(s)}
                className="rounded bg-ink-900/70 p-1 text-ink-300 hover:text-red-300"
                title="削除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )
      )}
    </aside>
  )
}
