import { useEffect, useState } from 'react'
import type { AspectRatio, Situation, Story } from '@shared/types'
import { api, useSituationTags } from '../api'
import { useToast } from './Toast'
import Modal from './Modal'
import TagPicker from './TagPicker'

interface Props {
  open: boolean
  situation: Situation | null // null = create
  storyId: number // target story for create
  stories: Story[]
  onClose: () => void
  onSaved: () => void
}

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: 'portrait', label: '縦 (832×1216)' },
  { value: 'square', label: '正方 (1024²)' },
  { value: 'landscape', label: '横 (1216×832)' }
]

export default function SituationModal({
  open,
  situation,
  storyId,
  stories,
  onClose,
  onSaved
}: Props): JSX.Element {
  const toast = useToast()
  const { data: tags, mutate: mutateTags } = useSituationTags()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [neg, setNeg] = useState('')
  const [aspect, setAspect] = useState<AspectRatio>('portrait')
  const [samples, setSamples] = useState('')
  const [targetStory, setTargetStory] = useState(storyId)
  const [tagIds, setTagIds] = useState<number[]>([])

  useEffect(() => {
    if (!open) return
    setName(situation?.name ?? '')
    setPrompt(situation?.prompt ?? '')
    setNeg(situation?.negative_prompt ?? '')
    setAspect(situation?.aspect_ratio ?? 'portrait')
    setSamples(situation?.dialogue_samples ?? '')
    setTargetStory(situation?.story_id ?? storyId)
    setTagIds(situation?.tags.map((t) => t.id) ?? [])
  }, [open, situation, storyId])

  async function createTag(rawName: string): Promise<void> {
    const t = await api.situationTags.create(rawName)
    mutateTags()
    setTagIds((ids) => (ids.includes(t.id) ? ids : [...ids, t.id]))
  }

  async function save(): Promise<void> {
    try {
      const payload = {
        name,
        prompt,
        negative_prompt: neg,
        aspect_ratio: aspect,
        dialogue_samples: samples,
        tag_ids: tagIds
      }
      if (situation) {
        await api.situations.update(situation.id, { ...payload, story_id: targetStory })
      } else {
        await api.situations.create({ story_id: targetStory, ...payload })
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      title={situation ? 'シチュエーション編集' : '新規シチュエーション'}
      onClose={onClose}
      wide
      backgroundUrl={situation?.preview_image_url ?? undefined}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs text-ink-500">
            名前 <span className="text-ink-500">（`xxx` は生成時にキャラ名へ置換）</span>
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: xxx is standing in the classroom"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs text-ink-500">プロンプト</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="classroom, standing, cowboy shot, looking at viewer"
            className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-500">ネガティブ（任意）</span>
          <textarea
            value={neg}
            onChange={(e) => setNeg(e.target.value)}
            rows={2}
            className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">アスペクト比</span>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as AspectRatio)}
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-2 text-sm"
            >
              {ASPECTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">ストーリー</span>
            <select
              value={targetStory}
              onChange={(e) => setTargetStory(Number(e.target.value))}
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-2 text-sm"
            >
              {stories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs text-ink-500">
            状況メモ / セリフ例（任意・1行に1つ）
            <span className="text-ink-500">
              　セリフ生成の文脈。状況や流れを書くのがおすすめ（Grok向き）。言いそうなセリフ例でも可（ローカル向き）。`xxx`はキャラ名へ置換
            </span>
          </span>
          <textarea
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            rows={4}
            placeholder={'例（状況）: xxxは水着姿を見られて恥ずかしがっている。からかわれて少しムキになる。\n例（セリフ）: あぅ…見ないでぇ…'}
            className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <div className="lg:col-span-2">
          <TagPicker tags={tags ?? []} selected={tagIds} onToggle={(id, on) => setTagIds((ids) => (on ? ids.filter((x) => x !== id) : [...ids, id]))} onCreate={createTag} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-700"
        >
          キャンセル
        </button>
        <button
          onClick={save}
          className="rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
        >
          保存
        </button>
      </div>
    </Modal>
  )
}
