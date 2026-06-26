import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Download, Moon, Plus, Sun, Trash2, Upload } from 'lucide-react'
import { api } from '../api'
import { useToast } from '../components/Toast'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const TOKEN_KEY = 'NOVELAI_API_TOKEN'

// Collapsible settings card — header (title) toggles a smooth grid-rows expand.
function SettingsCard({
  title,
  defaultOpen = false,
  children
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className={`overflow-hidden rounded-xl border border-ink-700 bg-ink-800/40 ${
        open ? 'sm:col-span-3' : ''
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-ink-800/60"
      >
        <span className="text-sm font-semibold text-ink-200">{title}</span>
        <ChevronDown
          size={18}
          className={`ml-auto shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

// Load a group of settings keys (with defaults) and persist edits. Shared by the
// settings sections so each doesn't re-implement the load/save boilerplate.
function useSettingsForm(defaults: Record<string, string>): {
  vals: Record<string, string>
  loaded: boolean
  save: (key: string, value: string) => void
} {
  const toast = useToast()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const keys = Object.keys(defaults)
    Promise.all(keys.map((k) => api.settings.get(k))).then((got) => {
      const next: Record<string, string> = {}
      keys.forEach((k, i) => (next[k] = got[i] ?? defaults[k]))
      setVals(next)
      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = (key: string, value: string): void => {
    setVals((s) => ({ ...s, [key]: value }))
    api.settings.set(key, value).then(() => toast.success('保存しました'))
  }
  return { vals, loaded, save }
}

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
  const { vals, loaded, save } = useSettingsForm(REFERENCE_KEYS)
  if (!loaded) return <></>
  const mode = vals.REFERENCE_MODE

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
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
    </div>
  )
}

const GROK_KEYS = { GROK_API_KEY: '', GROK_MODEL: 'grok-4.3' } as const

function GrokSettings(): JSX.Element {
  const toast = useToast()
  const { vals, loaded, save } = useSettingsForm(GROK_KEYS)
  const [testing, setTesting] = useState(false)
  if (!loaded) return <></>

  async function test(): Promise<void> {
    setTesting(true)
    try {
      const r = await api.grok.test()
      toast.success(`接続OK（${r.name}）`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        セリフ・記事文を xAI の Grok API で生成します。送信内容は xAI に送られます（露骨な表現は規約上拒否されることがあります）。
      </p>
      <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-500">API キー</span>
          <input
            type="password"
            defaultValue={vals.GROK_API_KEY}
            onBlur={(e) => e.target.value !== vals.GROK_API_KEY && save('GROK_API_KEY', e.target.value)}
            placeholder="xai-..."
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-500">モデル名</span>
          <input
            defaultValue={vals.GROK_MODEL}
            onBlur={(e) => e.target.value !== vals.GROK_MODEL && save('GROK_MODEL', e.target.value)}
            placeholder="grok-4.3"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
        </label>
      </div>
      <button
        onClick={test}
        disabled={testing}
        className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
      >
        {testing ? '確認中…' : '疎通確認'}
      </button>
    </div>
  )
}

const WP_KEYS = {
  WP_SITE_URL: '',
  WP_USERNAME: '',
  WP_APP_PASSWORD: ''
} as const

function WpSettings(): JSX.Element {
  const toast = useToast()
  const { vals, loaded, save } = useSettingsForm(WP_KEYS)
  const [testing, setTesting] = useState(false)

  async function test(): Promise<void> {
    setTesting(true)
    try {
      const r = await api.wordpress.test()
      toast.success(`接続OK（${r.name} として認証）`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  if (!loaded) return <></>

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        記事を下書きとして投稿します。認証はアプリケーションパスワード（ユーザー → プロフィール → アプリケーションパスワード）。
      </p>
      <label className="block sm:max-w-lg">
        <span className="mb-1 block text-xs text-ink-500">サイト URL</span>
        <input
          defaultValue={vals.WP_SITE_URL}
          onBlur={(e) => e.target.value !== vals.WP_SITE_URL && save('WP_SITE_URL', e.target.value.trim())}
          placeholder="https://example.com"
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-500">ユーザー名</span>
          <input
            defaultValue={vals.WP_USERNAME}
            onBlur={(e) => e.target.value !== vals.WP_USERNAME && save('WP_USERNAME', e.target.value)}
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-500">アプリケーションパスワード</span>
          <input
            type="password"
            defaultValue={vals.WP_APP_PASSWORD}
            onBlur={(e) => e.target.value !== vals.WP_APP_PASSWORD && save('WP_APP_PASSWORD', e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
        </label>
      </div>
      <button
        onClick={test}
        disabled={testing}
        className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
      >
        {testing ? '確認中…' : '疎通確認'}
      </button>
    </div>
  )
}

function PreviewSettings(): JSX.Element {
  const { vals, loaded, save } = useSettingsForm({ PREVIEW_PROMPT: '' })
  if (!loaded) return <></>
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        キャラ詳細の「プレビュー生成」時に、シーンとして追加するプロンプト（品質タグや既定のポーズなど）。
      </p>
      <textarea
        defaultValue={vals.PREVIEW_PROMPT}
        onBlur={(e) => e.target.value !== vals.PREVIEW_PROMPT && save('PREVIEW_PROMPT', e.target.value)}
        rows={2}
        placeholder="例: cowboy shot, standing, simple background, looking at viewer"
        className="w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent/60 sm:max-w-lg"
      />
    </div>
  )
}

function AdSettings(): JSX.Element {
  const toast = useToast()
  const [links, setLinks] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.settings.get('AD_LINKS').then((v) => {
      try {
        const arr = JSON.parse(v || '[]')
        setLinks(Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [])
      } catch {
        setLinks([])
      }
      setLoaded(true)
    })
  }, [])

  const persist = (next: string[]): void => {
    setLinks(next)
    api.settings.set('AD_LINKS', JSON.stringify(next.filter((s) => s.trim()))).then(() =>
      toast.success('保存しました')
    )
  }

  if (!loaded) return <></>

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        HTML形式で複数登録できます。記事生成時、各章見出し（2番目以降）の直前にこの中からランダムで1つ挿入されます。
      </p>
      <div className="space-y-2 sm:max-w-xl">
        {links.map((html, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              defaultValue={html}
              onBlur={(e) => {
                if (e.target.value !== links[i]) {
                  const next = [...links]
                  next[i] = e.target.value
                  persist(next)
                }
              }}
              rows={2}
              placeholder='<a href="https://...">広告</a>'
              className="flex-1 resize-y rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 font-mono text-xs outline-none focus:border-accent/60"
            />
            <button
              onClick={() => persist(links.filter((_, j) => j !== i))}
              className="mt-1 rounded-md p-1 text-ink-500 hover:text-red-300"
              title="削除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setLinks((l) => [...l, ''])}
        className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-ink-200 hover:border-accent/60 hover:text-accent"
      >
        <Plus size={14} /> 広告を追加
      </button>
    </div>
  )
}

function ThemeSettings(): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const choose = (t: Theme): void => {
    setTheme(t)
    setThemeState(t)
  }
  const seg = (active: boolean): string =>
    `flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm ${
      active ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'
    }`
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">画面全体の配色を切り替えます。すぐに反映されます。</p>
      <div className="inline-flex gap-1 rounded-lg border border-ink-700 bg-ink-800/50 p-1">
        <button onClick={() => choose('dark')} className={seg(theme === 'dark')}>
          <Moon size={14} /> ダーク
        </button>
        <button onClick={() => choose('light')} className={seg(theme === 'light')}>
          <Sun size={14} /> ライト
        </button>
      </div>
    </div>
  )
}

function BackupSettings(): JSX.Element {
  const toast = useToast()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)

  async function doExport(): Promise<void> {
    setBusy('export')
    try {
      const r = await api.backup.export()
      if (r.saved) toast.success('エクスポートしました')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function doImport(): Promise<void> {
    const ok = confirm(
      '現在のデータ（キャラ・画像・生成結果すべて）をバックアップの内容で置き換えます。\n' +
        '現在のデータは念のため別フォルダに退避され、完了後アプリが再起動します。続けますか？'
    )
    if (!ok) return
    setBusy('import')
    try {
      // On success the main process relaunches/exits, so this rarely returns.
      const r = await api.backup.import()
      if (!r.imported) setBusy(null)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        データベースと画像をまとめて1つの .zip に書き出します。別PCへの移行や定期バックアップに。
        インポートすると現在のデータは置き換わります（旧データは退避され、アプリが再起動します）。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={doExport}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:border-accent/60 hover:text-accent disabled:opacity-40"
        >
          <Download size={15} /> {busy === 'export' ? '書き出し中…' : 'エクスポート'}
        </button>
        <button
          onClick={doImport}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:border-red-400/60 hover:text-red-300 disabled:opacity-40"
        >
          <Upload size={15} /> {busy === 'import' ? '取り込み中…' : 'インポート'}
        </button>
      </div>
    </div>
  )
}

export default function Settings(): JSX.Element {
  const toast = useToast()
  const [token, setToken] = useState('')
  const [tokenLoaded, setTokenLoaded] = useState(false)
  const [anlas, setAnlas] = useState<number | null>(null)
  const [anlasLoading, setAnlasLoading] = useState(false)

  const refreshAnlas = (): void => {
    setAnlasLoading(true)
    api.novelai
      .anlas()
      .then(setAnlas)
      .catch(() => setAnlas(null))
      .finally(() => setAnlasLoading(false))
  }

  useEffect(() => {
    api.settings.get(TOKEN_KEY).then((v) => {
      setToken(v ?? '')
      setTokenLoaded(true)
      if (v?.trim()) refreshAnlas()
    })
  }, [])

  async function saveToken(): Promise<void> {
    await api.settings.set(TOKEN_KEY, token.trim())
    toast.success('トークンを保存しました')
    refreshAnlas()
  }

  async function testToken(): Promise<void> {
    try {
      const a = await api.novelai.anlas()
      setAnlas(a)
      toast.success(`接続OK（残りAnlas: ${a.toLocaleString()}）`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <h1 className="mb-3 text-xl font-semibold">設定</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SettingsCard title="NovelAI トークン" defaultOpen>
        <p className="mb-2 text-xs text-ink-500">プレビュー生成に必要です。ローカルの DB に保存されます。</p>
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
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <span>
            残り Anlas:{' '}
            <span className="font-semibold text-ink-200">
              {anlasLoading ? '確認中…' : anlas != null ? anlas.toLocaleString() : '—'}
            </span>
          </span>
          <button
            onClick={refreshAnlas}
            disabled={anlasLoading}
            className="rounded border border-ink-600 px-2 py-0.5 text-ink-300 hover:border-accent/60 hover:text-accent disabled:opacity-40"
          >
            更新
          </button>
          <button
            onClick={testToken}
            className="rounded border border-ink-600 px-2 py-0.5 text-ink-300 hover:border-accent/60 hover:text-accent"
          >
            疎通確認
          </button>
        </div>
      </SettingsCard>

      <SettingsCard title="テーマ（表示の配色）">
        <ThemeSettings />
      </SettingsCard>
      <SettingsCard title="参照画像の生成への反映">
        <ReferenceSettings />
      </SettingsCard>
      <SettingsCard title="キャラ試し撃ち（プレビュー）">
        <PreviewSettings />
      </SettingsCard>
      <SettingsCard title="Grok設定">
        <GrokSettings />
      </SettingsCard>
      <SettingsCard title="WordPress 投稿">
        <WpSettings />
      </SettingsCard>
      <SettingsCard title="広告リンク（2番目以降の h2 直前に挿入）">
        <AdSettings />
      </SettingsCard>
      <SettingsCard title="データのバックアップ / 移行">
        <BackupSettings />
      </SettingsCard>
      </div>
    </div>
  )
}
