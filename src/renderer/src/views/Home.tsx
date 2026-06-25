import heroUrl from '../assets/hero.png'
import listIcon from '../assets/icons/list.webp'
import situationsIcon from '../assets/icons/situations.webp'
import batchIcon from '../assets/icons/batch.webp'
import galleryIcon from '../assets/icons/gallery.webp'
import articlesIcon from '../assets/icons/articles.webp'
import settingsIcon from '../assets/icons/settings.webp'

export type HomeTarget = 'list' | 'situations' | 'batch' | 'gallery' | 'articles' | 'settings'

interface Props {
  onNavigate: (target: HomeTarget) => void
}

// `imgClass`: per-tile image tweaks (e.g. brightening a dark icon).
const LINKS: { target: HomeTarget; label: string; desc: string; img: string; imgClass?: string }[] = [
  { target: 'list', label: 'キャラクター', desc: 'プロフィール・参照画像', img: listIcon },
  { target: 'situations', label: 'シチュエーション', desc: 'ストーリーと場面', img: situationsIcon },
  { target: 'batch', label: '一括生成', desc: 'キャラ×シチュをまとめて', img: batchIcon },
  { target: 'gallery', label: 'ギャラリー', desc: '生成画像・セリフ', img: galleryIcon, imgClass: 'brightness-150' },
  { target: 'articles', label: '記事', desc: 'WordPress下書き', img: articlesIcon },
  { target: 'settings', label: '設定', desc: 'トークン・LLM・WP', img: settingsIcon }
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

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {LINKS.map(({ target, label, desc, img, imgClass }) => (
          <button
            key={target}
            onClick={() => onNavigate(target)}
            className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-ink-700 transition hover:ring-accent/60"
          >
            {/* scaled up ~1.4x so ~15% of each edge is cropped by the rounded card */}
            <img
              src={img}
              alt={label}
              className={`absolute inset-0 h-full w-full scale-[1.4] object-cover transition duration-300 group-hover:scale-[1.5] ${imgClass ?? ''}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-ink-900/10 to-transparent" />
            <div className="absolute bottom-0 left-0 p-3 text-left">
              <div className="text-base font-bold text-white drop-shadow">{label}</div>
              <div className="text-[11px] text-ink-200/90 drop-shadow">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
