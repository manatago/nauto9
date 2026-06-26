import { useEffect, useState } from 'react'
import { Check, Play, Wand2 } from 'lucide-react'
import { api, useBatches, useCharacters, useSituations, useStories, useTags } from '../api'
import { useToast } from '../components/Toast'
import CharacterCardGrid from '../components/CharacterCardGrid'
import CharacterMultiGrid from '../components/CharacterMultiGrid'
import StoryCardGrid from '../components/StoryCardGrid'

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
  const [selectedChars, setSelectedChars] = useState<number[]>([])
  const [selectedSits, setSelectedSits] = useState<number[]>([])
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [starting, setStarting] = useState(false)

  const { data: situations } = useSituations(mode === 'scene' ? storyId : null)
  const story = stories?.find((s) => s.id === storyId)

  // reset situation selection when the story changes
  useEffect(() => setSelectedSits([]), [storyId])

  const storyCanStart = characterId != null && storyId != null && (story?.situation_count ?? 0) > 0
  const sceneCount = selectedSits.length * selectedChars.length
  const sceneCanStart = storyId != null && selectedSits.length > 0 && selectedChars.length > 0

  async function start(): Promise<void> {
    setStarting(true)
    try {
      if (mode === 'story') {
        if (!storyCanStart) return
        await api.batches.create({
          character_id: characterId!,
          story_id: storyId!,
          name: name.trim(),
          prefix_prompt: prefix.trim()
        })
      } else {
        if (!sceneCanStart) return
        await api.batches.createScene({
          story_id: storyId!,
          situation_ids: selectedSits,
          character_ids: selectedChars,
          name: name.trim(),
          prefix_prompt: prefix.trim()
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

  const situationsPicker =
    storyId == null ? (
      <div className="rounded-md border border-ink-700 bg-ink-900/40 px-2 py-3 text-xs text-ink-500">
        先にストーリーを選んでください
      </div>
    ) : (
      <>
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
        {(situations ?? []).length === 0 ? (
          <div className="rounded-md border border-ink-700 bg-ink-900/40 px-2 py-3 text-xs text-ink-500">
            シチュエーションがありません
          </div>
        ) : (
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-ink-700 bg-ink-900/40 p-2 sm:grid-cols-4">
            {(situations ?? []).map((s) => {
              const on = selectedSits.includes(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setSelectedSits((ids) => (on ? ids.filter((x) => x !== s.id) : [...ids, s.id]))
                  }
                  className={`group relative aspect-[3/4] overflow-hidden rounded-lg border ${
                    on ? 'border-accent ring-2 ring-accent/60' : 'border-ink-700 hover:border-ink-500'
                  }`}
                >
                  {s.preview_image_url ? (
                    <img
                      src={s.preview_image_url}
                      className={`absolute inset-0 h-full w-full object-cover ${on ? '' : 'opacity-90 group-hover:opacity-100'}`}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] leading-snug text-ink-500">
                      {s.prompt || s.name || '（未設定）'}
                    </div>
                  )}
                  {on && (
                    <div className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-ink-900">
                      <Check size={12} />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-5">
                    <span className="block truncate text-[10px] text-white">
                      {s.name || '（無題）'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </>
    )

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <h1 className="mb-4 text-xl font-semibold">一括生成</h1>

      <div className="mb-5 flex gap-1 rounded-lg border border-ink-700 bg-ink-800/50 p-1">
        <button className={tabClass(mode === 'story')} onClick={() => setMode('story')}>
          ストーリー（1キャラ × 全シーン）
        </button>
        <button className={tabClass(mode === 'scene')} onClick={() => setMode('scene')}>
          複数キャラ × シーン
        </button>
      </div>

      {/* two columns: selection (left = who, right = what scene) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {mode === 'story' ? (
          <>
            <section>
              <span className="mb-1 block text-xs text-ink-500">キャラクター</span>
              <CharacterCardGrid
                characters={characters ?? []}
                tags={tags ?? []}
                value={characterId}
                onChange={setCharacterId}
              />
            </section>
            <section className="space-y-4">
              <div>
                <span className="mb-1 block text-xs text-ink-500">ストーリー</span>
                <StoryCardGrid stories={stories ?? []} value={storyId} onChange={setStoryId} />
              </div>
              <div className="rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-ink-400">
                生成枚数: {story?.situation_count ?? 0} 枚
              </div>
            </section>
          </>
        ) : (
          <>
            <section>
              <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
                <span>キャラクター（手動で選択・タグで絞って一括選択）</span>
                {selectedChars.length > 0 && (
                  <button onClick={() => setSelectedChars([])} className="text-ink-400 hover:text-accent">
                    全解除（{selectedChars.length}人）
                  </button>
                )}
              </div>
              <CharacterMultiGrid
                characters={characters ?? []}
                tags={tags ?? []}
                value={selectedChars}
                onChange={setSelectedChars}
              />
            </section>
            <section className="space-y-4">
              <div>
                <span className="mb-1 block text-xs text-ink-500">ストーリー</span>
                <StoryCardGrid stories={stories ?? []} value={storyId} onChange={setStoryId} />
              </div>
              <div>{situationsPicker}</div>
              <div className="rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-ink-400">
                生成枚数: {sceneCount} 枚（{selectedSits.length} シーン × {selectedChars.length} キャラ）
              </div>
            </section>
          </>
        )}
      </div>

      {/* common settings span the full width */}
      <div className="mt-6 space-y-4 border-t border-ink-700 pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">
              共通プロンプト（任意・各シチュプロンプトの先頭に付与）
            </span>
            <textarea
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              rows={2}
              placeholder="例: masterpiece, best quality, 8k"
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">バッチ名（任意）</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="未入力なら自動命名"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
        </div>

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
