import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles, Star, Trash2 } from 'lucide-react'
import type { CharacterUpdateInput, PromptReplacement } from '@shared/types'
import { api, fileToDataUrl, useCharacter, useCharacters, useTags } from '../api'
import { useToast } from '../components/Toast'
import ImageGallery from '../components/ImageGallery'
import Modal from '../components/Modal'
import TagPicker from '../components/TagPicker'
import ReplacementsEditor from '../components/ReplacementsEditor'

interface Props {
  characterId: number
  onBack: () => void
  onSelect?: (id: number) => void // navigate to another character without closing
}

export default function CharacterDetail({ characterId, onBack, onSelect }: Props): JSX.Element {
  const toast = useToast()
  const { data: character, mutate } = useCharacter(characterId)
  const { data: list } = useCharacters()
  const { data: tags, mutate: mutateTags } = useTags()

  // Prev/next in the (default) character list order — like the gallery viewer.
  const idx = list?.findIndex((c) => c.id === characterId) ?? -1
  const prev = idx > 0 ? (list as NonNullable<typeof list>)[idx - 1] : null
  const next = list && idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null

  useEffect(() => {
    if (!onSelect) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && prev) onSelect(prev.id)
      else if (e.key === 'ArrowRight' && next) onSelect(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSelect, prev, next])

  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [neg, setNeg] = useState('')
  const [memo, setMemo] = useState('')
  const [persona, setPersona] = useState('')
  const [tagIds, setTagIds] = useState<number[]>([])
  const [replacements, setReplacements] = useState<PromptReplacement[]>([])
  const [preview, setPreview] = useState<{
    url: string
    path: string
    ref: { mode: 'none' | 'vibe' | 'precise'; count: number }
  } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    if (!character) return
    setName(character.name)
    setPrompt(character.prompt)
    setNeg(character.negative_prompt)
    setMemo(character.memo)
    setPersona(character.persona)
    setTagIds(character.tags.map((t) => t.id))
    setReplacements(character.prompt_replacements)
  }, [character])

  if (!character) return <div className="p-8 text-ink-500">読み込み中…</div>

  // Persist the whole form. `overrides` lets callers save a fresh value
  // immediately (e.g. a tag toggle) without relying on async state timing.
  async function persist(overrides: CharacterUpdateInput = {}): Promise<void> {
    await api.characters.update(characterId, {
      name: name.trim(),
      prompt,
      negative_prompt: neg,
      memo,
      persona,
      tag_ids: tagIds,
      prompt_replacements: replacements.filter((r) => r.find.trim()),
      ...overrides
    })
    mutate()
  }

  const saveBase = (): Promise<void> => persist()

  function toggleTag(tagId: number, on: boolean): void {
    const next = on ? tagIds.filter((x) => x !== tagId) : [...tagIds, tagId]
    setTagIds(next)
    persist({ tag_ids: next })
  }

  function removeReplacement(index: number): void {
    const next = replacements.filter((_, j) => j !== index)
    setReplacements(next)
    persist({ prompt_replacements: next.filter((r) => r.find.trim()) })
  }

  async function createTag(rawName: string): Promise<void> {
    const t = await api.tags.create(rawName)
    mutateTags()
    const next = tagIds.includes(t.id) ? tagIds : [...tagIds, t.id]
    setTagIds(next)
    persist({ tag_ids: next })
  }

  async function guard(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn()
      mutate()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function upload(files: File[]): Promise<void> {
    const encoded = await Promise.all(
      files.map(async (f) => ({ name: f.name, dataUrl: await fileToDataUrl(f) }))
    )
    await api.characterImages.add({ character_id: characterId, files: encoded })
    mutate()
  }

  async function runPreview(): Promise<void> {
    setPreviewing(true)
    try {
      const r = await api.preview.run(characterId)
      setPreview({ url: r.image_url, path: r.image_path, ref: r.reference })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <div className="mb-4 flex items-center">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100"
        >
          <ArrowLeft size={16} /> 一覧へ戻る
        </button>
        {onSelect && (
          <div className="ml-auto flex items-center gap-1">
            {idx >= 0 && list && (
              <span className="mr-1 text-xs text-ink-600">
                {idx + 1} / {list.length}
              </span>
            )}
            <button
              onClick={() => prev && onSelect(prev.id)}
              disabled={!prev}
              title="前のキャラ (←)"
              className="rounded-md border border-ink-600 p-1 text-ink-300 hover:border-accent/60 hover:text-accent disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => next && onSelect(next.id)}
              disabled={!next}
              title="次のキャラ (→)"
              className="rounded-md border border-ink-600 p-1 text-ink-300 hover:border-accent/60 hover:text-accent disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* left: prompt + meta */}
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveBase}
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-lg font-semibold outline-none focus:border-accent/60"
          />
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">プロンプト</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={saveBase}
              rows={8}
              placeholder="1girl, long black hair, blue eyes, school uniform"
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">ネガティブ（任意）</span>
            <textarea
              value={neg}
              onChange={(e) => setNeg(e.target.value)}
              onBlur={saveBase}
              rows={3}
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>

          <TagPicker
            tags={tags ?? []}
            selected={tagIds}
            onToggle={toggleTag}
            onCreate={createTag}
          />

          <ReplacementsEditor
            value={replacements}
            onChange={setReplacements}
            onCommit={saveBase}
            onRemove={removeReplacement}
          />

          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">
              性格・口調（セリフ生成に使用）
            </span>
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              onBlur={saveBase}
              rows={4}
              placeholder="例: 内気でぶっきらぼう。一人称は「あたし」。早口で「〜じゃない」「べつに」が口癖。素直になれず照れると強がる。"
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">メモ（任意）</span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={saveBase}
              rows={2}
              className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>

          <button
            onClick={async () => {
              if (!confirm(`「${character.name}」を削除しますか？`)) return
              await api.characters.delete(characterId)
              onBack()
            }}
            className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-red-300"
          >
            <Trash2 size={13} /> このキャラを削除
          </button>
        </div>

        {/* right: reference images + preview */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-300">参照画像（vibe / 精密参照）</h3>
            <button
              onClick={runPreview}
              disabled={previewing}
              className="flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-xs text-accent ring-1 ring-accent/40 hover:bg-accent/25 disabled:opacity-50"
            >
              <Sparkles size={14} /> {previewing ? '生成中…' : 'プレビュー生成'}
            </button>
          </div>
          <ImageGallery
            images={character.images}
            onUpload={upload}
            onReorder={(ids) => guard(() => api.characterImages.reorder(characterId, ids))}
            onToggleReference={(id) => guard(() => api.characterImages.toggleReference(id))}
            onUpdateCaption={(id, caption) => guard(() => api.characterImages.update(id, { caption }))}
            onToggleGrayscale={(id) => {
              const img = character.images.find((i) => i.id === id)
              guard(() => api.characterImages.update(id, { is_grayscale: !img?.is_grayscale }))
            }}
            onDelete={(id) => guard(() => api.characterImages.delete(id))}
          />
        </div>
      </div>

      <Modal open={!!preview} title="プレビュー結果" onClose={() => setPreview(null)}>
        {preview && (
          <div className="space-y-3">
            <div
              className={`rounded-md px-3 py-1.5 text-xs ${
                preview.ref.count > 0
                  ? 'bg-accent/15 text-accent ring-1 ring-accent/40'
                  : 'bg-ink-700 text-ink-400'
              }`}
            >
              {preview.ref.count > 0
                ? `${preview.ref.mode === 'precise' ? '精密参照' : 'Vibe参照'} を ${preview.ref.count} 枚適用しました`
                : preview.ref.mode === 'none'
                  ? '参照なし（設定で「使わない」になっています）'
                  : '参照なし（「参照ON」の画像がありません）'}
            </div>
            <img src={preview.url} className="mx-auto max-h-[60vh] rounded-lg" />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-700"
              >
                閉じる
              </button>
              <button
                onClick={() =>
                  guard(async () => {
                    await api.characterImages.saveFromPath(characterId, preview.path)
                    setPreview(null)
                    toast.success('参照画像として保存しました')
                  })
                }
                className="flex items-center gap-1.5 rounded-md bg-accent/20 px-3 py-1.5 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
              >
                <Star size={15} /> 参照画像として保存
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
