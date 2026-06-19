import { useEffect, useMemo, useState } from 'react'
import { Play, Wand2 } from 'lucide-react'
import { api, useBatches, useCharacters, useSituations, useStories, useTags } from '../api'
import { useToast } from '../components/Toast'
import CharacterPicker from '../components/CharacterPicker'

type Mode = 'story' | 'scene'

interface Props {
  onCreated: () => void // switch to gallery
}

export default function BatchCreate({ onCreated }: Props): JSX.Element {
  const toast = useToast()
  const { data: characters } = useCharacters()
  const { data: stories } = useStories()
  const { data: tags } = useTags()
  const { mutate: mutateBatches } = useBatches()

  const [mode, setMode] = useState<Mode>('story')
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [storyId, setStoryId] = useState<number | null>(null)
  const [tagId, setTagId] = useState<number | null>(null)
  const [selectedSits, setSelectedSits] = useState<number[]>([])
  const [name, setName] = useState('')
  const [starting, setStarting] = useState(false)

  const { data: situations } = useSituations(mode === 'scene' ? storyId : null)
  const story = stories?.find((s) => s.id === storyId)

  // characters carrying the chosen tag (for the count + preview)
  const tagChars = useMemo(
    () => (tagId == null ? [] : (characters ?? []).filter((c) => c.tags.some((t) => t.id === tagId))),
    [characters, tagId]
  )

  // reset situation selection when the story changes
  useEffect(() => setSelectedSits([]), [storyId])

  const storyCanStart = characterId != null && storyId != null && (story?.situation_count ?? 0) > 0
  const sceneCount = selectedSits.length * tagChars.length
  const sceneCanStart = storyId != null && selectedSits.length > 0 && tagId != null && tagChars.length > 0

  async function start(): Promise<void> {
    setStarting(true)
    try {
      if (mode === 'story') {
        if (!storyCanStart) return
        await api.batches.create({ character_id: characterId!, story_id: storyId!, name: name.trim() })
      } else {
        if (!sceneCanStart) return
        await api.batches.createScene({
          story_id: storyId!,
          situation_ids: selectedSits,
          character_tag_id: tagId!,
          name: name.trim()
        })
      }
      mutateBatches()
      toast.success('生成を開始しました')
      onCreated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const tabClass = (active: boolean): string =>
    `flex-1 rounded-md px-3 py-1.5 text-sm ${active ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'}`

  return (
    <div className="mx-auto max-w-xl px-6 py-6">
      <h1 className="mb-4 text-xl font-semibold">一括生成</h1>

      <div className="mb-5 flex gap-1 rounded-lg border border-ink-700 bg-ink-800/50 p-1">
        <button className={tabClass(mode === 'story')} onClick={() => setMode('story')}>
          ストーリー（1キャラ × 全シーン）
        </button>
        <button className={tabClass(mode === 'scene')} onClick={() => setMode('scene')}>
          シーン × タグ（複数キャラ）
        </button>
      </div>

      <div className="space-y-4">
        {mode === 'story' ? (
          <>
            <div>
              <span className="mb-1 block text-xs text-ink-500">キャラクター</span>
              <CharacterPicker
                characters={characters ?? []}
                value={characterId}
                onChange={setCharacterId}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">ストーリー</span>
              <select
                value={storyId ?? ''}
                onChange={(e) => setStoryId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {(stories ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.situation_count}）
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-ink-400">
              生成枚数: {story?.situation_count ?? 0} 枚
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">ストーリー</span>
              <select
                value={storyId ?? ''}
                onChange={(e) => setStoryId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {(stories ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.situation_count}）
                  </option>
                ))}
              </select>
            </label>

            {storyId != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
                  <span>シチュエーション（複数選択）</span>
                  <button
                    onClick={() =>
                      setSelectedSits(
                        selectedSits.length === (situations?.length ?? 0)
                          ? []
                          : (situations ?? []).map((s) => s.id)
                      )
                    }
                    className="text-ink-400 hover:text-accent"
                  >
                    {selectedSits.length === (situations?.length ?? 0) && selectedSits.length > 0
                      ? '全解除'
                      : '全選択'}
                  </button>
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-2">
                  {(situations ?? []).length === 0 ? (
                    <div className="px-1 py-2 text-xs text-ink-600">シチュエーションがありません</div>
                  ) : (
                    (situations ?? []).map((s) => {
                      const on = selectedSits.includes(s.id)
                      return (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-ink-800">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setSelectedSits((ids) =>
                                on ? ids.filter((x) => x !== s.id) : [...ids, s.id]
                              )
                            }
                          />
                          <span className="truncate text-ink-200">{s.name || '（無題）'}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-ink-500">{s.aspect_ratio}</span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">キャラクタータグ</span>
              <select
                value={tagId ?? ''}
                onChange={(e) => setTagId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {(tags ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {tagId != null && (
                <span className="mt-1 block text-[11px] text-ink-500">
                  このタグのキャラ: {tagChars.length} 人
                  {tagChars.length > 0 && `（${tagChars.slice(0, 5).map((c) => c.name).join('、')}${tagChars.length > 5 ? '…' : ''}）`}
                </span>
              )}
            </label>

            <div className="rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-ink-400">
              生成枚数: {sceneCount} 枚（{selectedSits.length} シーン × {tagChars.length} キャラ）
            </div>
          </>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-ink-500">バッチ名（任意）</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="未入力なら自動命名"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>

        <button
          onClick={start}
          disabled={(mode === 'story' ? !storyCanStart : !sceneCanStart) || starting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent/20 px-4 py-2.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30 disabled:opacity-40"
        >
          {mode === 'story' ? <Play size={16} /> : <Wand2 size={16} />}
          {starting ? '開始中…' : '生成開始'}
        </button>
      </div>
    </div>
  )
}
