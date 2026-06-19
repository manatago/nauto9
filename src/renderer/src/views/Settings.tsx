import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '../api'
import { useToast } from '../components/Toast'

const TOKEN_KEY = 'NOVELAI_API_TOKEN'

const REFERENCE_KEYS = {
  REFERENCE_MODE: 'vibe',
  VIBE_INFORMATION_EXTRACTED: '0.6',
  VIBE_REFERENCE_STRENGTH: '0.45',
  CR_REFERENCE_STRENGTH: '0.7',
  CR_FIDELITY: '0.7',
  CR_TYPE: 'character'
} as const

function NumberField({
  label,
  value,
  onSave
}: {
  label: string
  value: string
  onSave: (v: string) => void
}): JSX.Element {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-500">{label}</span>
      <input
        type="number"
        step="0.05"
        min="0"
        max="1"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
      />
    </label>
  )
}

function ReferenceSettings(): JSX.Element {
  const toast = useToast()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const keys = Object.keys(REFERENCE_KEYS) as (keyof typeof REFERENCE_KEYS)[]
    Promise.all(keys.map((k) => api.settings.get(k))).then((got) => {
      const next: Record<string, string> = {}
      keys.forEach((k, i) => (next[k] = got[i] ?? REFERENCE_KEYS[k]))
      setVals(next)
      setLoaded(true)
    })
  }, [])

  async function save(key: string, value: string): Promise<void> {
    setVals((s) => ({ ...s, [key]: value }))
    await api.settings.set(key, value)
    toast.success('保存しました')
  }

  if (!loaded) return <section />
  const mode = vals.REFERENCE_MODE

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-ink-300">参照画像の生成への反映</h2>
      <p className="text-xs text-ink-600">
        「参照ON」にした画像をプレビュー生成へ送ります。Vibe Transfer か精密参照を選べます。
      </p>
      <label className="block max-w-xs">
        <span className="mb-1 block text-xs text-ink-500">参照モード</span>
        <select
          value={mode}
          onChange={(e) => save('REFERENCE_MODE', e.target.value)}
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-2 text-sm"
        >
          <option value="none">使わない</option>
          <option value="vibe">Vibe Transfer</option>
          <option value="precise">精密参照 (Director Reference)</option>
        </select>
      </label>

      {mode === 'vibe' && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <NumberField
            label="情報抽出 (information_extracted)"
            value={vals.VIBE_INFORMATION_EXTRACTED}
            onSave={(v) => save('VIBE_INFORMATION_EXTRACTED', v)}
          />
          <NumberField
            label="参照強度 (reference_strength)"
            value={vals.VIBE_REFERENCE_STRENGTH}
            onSave={(v) => save('VIBE_REFERENCE_STRENGTH', v)}
          />
        </div>
      )}

      {mode === 'precise' && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <NumberField
            label="参照強度 (strength)"
            value={vals.CR_REFERENCE_STRENGTH}
            onSave={(v) => save('CR_REFERENCE_STRENGTH', v)}
          />
          <NumberField label="fidelity" value={vals.CR_FIDELITY} onSave={(v) => save('CR_FIDELITY', v)} />
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">参照タイプ</span>
            <select
              value={vals.CR_TYPE}
              onChange={(e) => save('CR_TYPE', e.target.value)}
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
            >
              <option value="character">character</option>
              <option value="style">style</option>
              <option value="character&style">character&style</option>
            </select>
          </label>
        </div>
      )}
    </section>
  )
}

export default function Settings(): JSX.Element {
  const toast = useToast()
  const [token, setToken] = useState('')
  const [tokenLoaded, setTokenLoaded] = useState(false)

  useEffect(() => {
    api.settings.get(TOKEN_KEY).then((v) => {
      setToken(v ?? '')
      setTokenLoaded(true)
    })
  }, [])

  async function saveToken(): Promise<void> {
    await api.settings.set(TOKEN_KEY, token.trim())
    toast.success('トークンを保存しました')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
      <h1 className="text-xl font-semibold">設定</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-300">NovelAI トークン</h2>
        <p className="text-xs text-ink-600">プレビュー生成に必要です。ローカルの DB に保存されます。</p>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            disabled={!tokenLoaded}
            onChange={(e) => setToken(e.target.value)}
            placeholder="pst-..."
            className="flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <button
            onClick={saveToken}
            className="flex items-center gap-1.5 rounded-md bg-accent/20 px-3 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
          >
            <Check size={15} /> 保存
          </button>
        </div>
      </section>

      <ReferenceSettings />
    </div>
  )
}
