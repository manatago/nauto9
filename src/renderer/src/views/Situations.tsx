import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { Check, Plus, Sparkles, X } from 'lucide-react'
import type { Situation, Story } from '@shared/types'
import { api, useSituations, useSituationTags, useStories } from '../api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import SituationModal from '../components/SituationModal'
import StorySidebar from '../components/StorySidebar'
import { SituationCard, SortableSituation } from '../components/SituationCard'

export default function Situations(): JSX.Element {
  const toast = useToast()
  const { data: stories, mutate: mutateStories } = useStories()
  const { data: tags } = useSituationTags()
  const [storyId, setStoryId] = useState<number | null>(null) // null = すべて（横断）
  const [filterTags, setFilterTags] = useState<number[]>([])
  const [renamingStory, setRenamingStory] = useState<number | null>(null)
  const [previewingIds, setPreviewingIds] = useState<number[]>([])
  const [shotResult, setShotResult] = useState<{ situation: Situation; url: string } | null>(null)
  const [modal, setModal] = useState<{ open: boolean; situation: Situation | null }>({
    open: false,
    situation: null
  })

  const { data: situations, mutate: mutateSituations } = useSituations(storyId)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Default to the first story once loaded.
  useEffect(() => {
    if (storyId === null && stories && stories.length > 0) setStoryId(stories[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories])

  const storyMap = useMemo(() => new Map((stories ?? []).map((s) => [s.id, s.name])), [stories])

  const filtered = useMemo(() => {
    let list = situations ?? []
    if (filterTags.length)
      list = list.filter((s) => filterTags.every((tid) => s.tags.some((t) => t.id === tid)))
    return list
  }, [situations, filterTags])

  // Reorder only makes sense inside one story with no tag filter applied.
  const reorderable = storyId !== null && filterTags.length === 0

  async function addStory(): Promise<void> {
    const s = await api.stories.create('新しいストーリー')
    mutateStories()
    setStoryId(s.id)
    setRenamingStory(s.id)
  }

  async function deleteStory(s: Story): Promise<void> {
    if (!confirm(`ストーリー「${s.name}」と中のシチュエーションを削除しますか？`)) return
    await api.stories.delete(s.id)
    if (storyId === s.id) setStoryId(null)
    mutateStories()
  }

  function onDragEnd(e: DragEndEvent): void {
    const { active, over } = e
    if (!over || active.id === over.id || storyId === null) return
    const ids = filtered.map((s) => s.id)
    const next = arrayMove(ids, ids.indexOf(active.id as number), ids.indexOf(over.id as number))
    api.situations
      .reorder(storyId, next)
      .then(() => mutateSituations())
      .catch((err) => toast.error((err as Error).message))
  }

  async function removeSituation(s: Situation): Promise<void> {
    await api.situations.delete(s.id)
    mutateSituations()
    mutateStories()
  }

  async function runPreview(s: Situation): Promise<void> {
    setPreviewingIds((ids) => [...ids, s.id])
    try {
      const updated = await api.situations.preview(s.id)
      mutateSituations()
      if (updated.preview_image_url) setShotResult({ situation: updated, url: updated.preview_image_url })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPreviewingIds((ids) => ids.filter((x) => x !== s.id))
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-5 px-6 py-5">
      <StorySidebar
        stories={stories ?? []}
        selectedId={storyId}
        renamingId={renamingStory}
        onSelect={setStoryId}
        onAdd={addStory}
        onStartRename={setRenamingStory}
        onCommitRename={(id, name) => {
          api.stories.rename(id, name).then(() => mutateStories())
        }}
        onDelete={deleteStory}
      />

      {/* situations */}
      <section className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">
            {storyId === null ? 'すべてのシチュエーション' : storyMap.get(storyId)}
          </h1>
          <span className="text-sm text-ink-500">{filtered.length}</span>
          {storyId !== null && (
            <button
              onClick={() => setModal({ open: true, situation: null })}
              className="ml-auto flex items-center gap-1.5 rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
            >
              <Plus size={15} /> シチュ追加
            </button>
          )}
        </div>

        {/* tag cross-cut filter */}
        {(tags ?? []).length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(tags ?? []).map((t) => {
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
                className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-200"
              >
                <X size={12} /> 解除
              </button>
            )}
          </div>
        )}

        {!reorderable && storyId !== null && filterTags.length > 0 && (
          <p className="mb-2 flex items-center gap-1 text-[11px] text-ink-600">
            <Check size={12} /> タグ絞り込み中は並び替えできません（解除すると可能）
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-600 py-16 text-center text-ink-600">
            {storyId === null
              ? 'シチュエーションがありません'
              : stories?.length
                ? '「シチュ追加」で作成してください'
                : '左の＋でストーリーを作成してください'}
          </div>
        ) : reorderable ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={filtered.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((s) => (
                  <SortableSituation
                    key={s.id}
                    situation={s}
                    previewing={previewingIds.includes(s.id)}
                    onEdit={() => setModal({ open: true, situation: s })}
                    onDelete={() => removeSituation(s)}
                    onPreview={() => runPreview(s)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((s) => (
              <SituationCard
                key={s.id}
                situation={s}
                showStoryName={storyId === null ? storyMap.get(s.story_id) : undefined}
                previewing={previewingIds.includes(s.id)}
                onEdit={() => setModal({ open: true, situation: s })}
                onDelete={() => removeSituation(s)}
                onPreview={() => runPreview(s)}
              />
            ))}
          </div>
        )}
      </section>

      <SituationModal
        open={modal.open}
        situation={modal.situation}
        storyId={storyId ?? stories?.[0]?.id ?? 0}
        stories={stories ?? []}
        onClose={() => setModal({ open: false, situation: null })}
        onSaved={() => {
          mutateSituations()
          mutateStories()
        }}
      />

      <Modal open={!!shotResult} title="試し撃ち結果" onClose={() => setShotResult(null)} wide>
        {shotResult && (
          <div className="space-y-3">
            <img src={shotResult.url} className="mx-auto max-h-[68vh] rounded-lg" />
            <p className="text-center text-xs text-ink-500">
              ランダムなキャラのプロンプトで生成しました。背景画像として設定済みです。
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => {
                  const s = shotResult.situation
                  setShotResult(null)
                  runPreview(s)
                }}
                className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:border-accent/60 hover:text-accent"
              >
                <Sparkles size={15} /> もう一度（別のキャラ）
              </button>
              <button
                onClick={() => setShotResult(null)}
                className="rounded-md bg-accent/20 px-4 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
