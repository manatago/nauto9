import { Plus, X } from 'lucide-react'
import type { PromptReplacement } from '@shared/types'

interface Props {
  value: PromptReplacement[]
  onChange: (next: PromptReplacement[]) => void
  onCommit: () => void // persist (e.g. on blur)
  onRemove: (index: number) => void
}

// SITUATION_REPLACEMENTS: per-character find→replace rules applied to situation
// prompts (partial match, case-insensitive, in order — same as nauto8).
export default function ReplacementsEditor({
  value,
  onChange,
  onCommit,
  onRemove
}: Props): JSX.Element {
  const patch = (i: number, field: 'find' | 'replace', v: string): void =>
    onChange(value.map((x, j) => (j === i ? { ...x, [field]: v } : x)))

  return (
    <div>
      <span className="mb-1 block text-xs text-ink-500">シチュ置換ルール（find → replace）</span>
      <div className="space-y-1.5">
        {value.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={r.find}
              onChange={(e) => patch(i, 'find', e.target.value)}
              onBlur={onCommit}
              placeholder="find"
              className="w-1/2 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs outline-none focus:border-accent/60"
            />
            <input
              value={r.replace}
              onChange={(e) => patch(i, 'replace', e.target.value)}
              onBlur={onCommit}
              placeholder="replace（空で削除）"
              className="w-1/2 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs outline-none focus:border-accent/60"
            />
            <button onClick={() => onRemove(i)} className="text-ink-500 hover:text-red-300">
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, { find: '', replace: '' }])}
          className="flex items-center gap-1 text-xs text-ink-400 hover:text-accent"
        >
          <Plus size={13} /> ルール追加
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">
        部分一致・大文字小文字無視・上から順に適用（nauto8 と同じ）。
      </p>
    </div>
  )
}
