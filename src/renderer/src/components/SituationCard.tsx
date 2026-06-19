import { GripVertical, Sparkles, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Situation } from '@shared/types'

export interface SituationCardProps {
  situation: Situation
  showStoryName?: string
  handle?: React.ReactNode
  previewing: boolean
  onEdit: () => void
  onDelete: () => void
  onPreview: () => void
}

const stop = (e: React.MouseEvent): void => e.stopPropagation()

export function SituationCard(props: SituationCardProps): JSX.Element {
  const s = props.situation
  return (
    <div className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-ink-700 bg-ink-800">
      {s.preview_image_url ? (
        <img src={s.preview_image_url} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] leading-snug text-ink-600">
          {s.prompt || '（プロンプト未設定）'}
        </div>
      )}

      {/* full-card click target for edit (info/actions sit above this) */}
      <button onClick={props.onEdit} className="absolute inset-0" title="クリックで編集" />

      {props.handle && (
        <div className="absolute left-1 top-1 rounded bg-ink-900/70 p-0.5" onClick={stop}>
          {props.handle}
        </div>
      )}

      <div className="absolute right-1 top-1 flex gap-1">
        <button
          onClick={(e) => {
            stop(e)
            props.onPreview()
          }}
          disabled={props.previewing}
          className="rounded bg-ink-900/70 p-1 text-ink-200 hover:text-accent disabled:opacity-50"
          title="試し撃ち（ランダムなキャラのプロンプトで生成）"
        >
          <Sparkles size={14} className={props.previewing ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={(e) => {
            stop(e)
            props.onDelete()
          }}
          className="rounded bg-ink-900/70 p-1 text-ink-200 hover:text-red-300"
          title="削除"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/95 via-ink-900/70 to-transparent p-2 pt-6">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-ink-50">{s.name || '（無題）'}</span>
          <span className="shrink-0 rounded bg-ink-900/70 px-1 text-[9px] text-ink-300">
            {s.aspect_ratio}
          </span>
        </div>
        {props.showStoryName && (
          <div className="truncate text-[10px] text-accent/80">{props.showStoryName}</div>
        )}
        {s.tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-0.5">
            {s.tags.map((t) => (
              <span key={t.id} className="rounded bg-ink-900/70 px-1 py-0.5 text-[9px] text-ink-300">
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SortableSituation(props: Omit<SituationCardProps, 'handle'>): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.situation.id
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-60' : ''}
    >
      <SituationCard
        {...props}
        handle={
          <span
            {...attributes}
            {...listeners}
            className="block cursor-grab text-ink-300 hover:text-ink-100"
            title="ドラッグで並び替え"
          >
            <GripVertical size={15} />
          </span>
        }
      />
    </div>
  )
}
