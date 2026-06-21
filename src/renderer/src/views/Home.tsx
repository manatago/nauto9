import { BookOpen, FileText, Images, Settings as SettingsIcon, Users, Wand2 } from 'lucide-react'
import heroUrl from '../assets/hero.png'

export type HomeTarget =
  | 'list'
  | 'situations'
  | 'batch'
  | 'gallery'
  | 'articles'
  | 'settings'

interface Props {
  onNavigate: (target: HomeTarget) => void
}

const LINKS: { target: HomeTarget; label: string; desc: string; icon: typeof Users }[] = [
  { target: 'list', label: 'キャラクター', desc: 'プロフィール・参照画像', icon: Users },
  { target: 'situations', label: 'シチュエーション', desc: 'ストーリーと場面', icon: BookOpen },
  { target: 'batch', label: '一括生成', desc: 'キャラ×シチュをまとめて', icon: Wand2 },
  { target: 'gallery', label: 'ギャラリー', desc: '生成画像・セリフ', icon: Images },
  { target: 'articles', label: '記事', desc: 'WordPress下書き', icon: FileText },
  { target: 'settings', label: '設定', desc: 'トークン・LLM・WP', icon: SettingsIcon }
]

export default function Home({ onNavigate }: Props): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-ink-700">
        <img src={heroUrl} alt="" className="h-56 w-full object-cover sm:h-72" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />
        <div className="absolute bottom-0 left-0 p-6">
          <h1 className="text-4xl font-black tracking-widest text-white drop-shadow">nauto9</h1>
          <p className="mt-1 text-sm text-ink-200/90 drop-shadow">
            ローカルで動く NovelAI キャラクター画像ジェネレーター
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LINKS.map(({ target, label, desc, icon: Icon }) => (
          <button
            key={target}
            onClick={() => onNavigate(target)}
            className="group flex flex-col items-start gap-2 rounded-xl border border-ink-700 bg-ink-800/40 p-4 text-left transition hover:border-accent/60 hover:bg-ink-800"
          >
            <Icon size={22} className="text-ink-400 group-hover:text-accent" />
            <div>
              <div className="text-sm font-semibold text-ink-100">{label}</div>
              <div className="text-xs text-ink-500">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
