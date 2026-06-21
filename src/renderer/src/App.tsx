import { useState } from 'react'
import { BookOpen, FileText, Home as HomeIcon, Images, Settings as SettingsIcon, Users, Wand2 } from 'lucide-react'
import { ToastProvider } from './components/Toast'
import Home, { type HomeTarget } from './views/Home'
import CharacterList from './views/CharacterList'
import CharacterDetail from './views/CharacterDetail'
import Situations from './views/Situations'
import BatchCreate from './views/BatchCreate'
import Gallery from './views/Gallery'
import Articles from './views/Articles'
import Settings from './views/Settings'

type View =
  | { name: 'home' }
  | { name: 'list' }
  | { name: 'detail'; id: number }
  | { name: 'situations' }
  | { name: 'batch' }
  | { name: 'gallery' }
  | { name: 'articles' }
  | { name: 'settings' }

export default function App(): JSX.Element {
  const [view, setView] = useState<View>({ name: 'home' })

  const isChars = view.name === 'list' || view.name === 'detail'
  const tabClass = (active: boolean): string =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
      active ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'
    }`

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-1 border-b border-ink-700 bg-ink-800/80 px-4 py-2 pl-20 backdrop-blur">
          <button
            onClick={() => setView({ name: 'home' })}
            className="mr-2 text-sm font-bold tracking-widest text-accent hover:opacity-80"
          >
            nauto9
          </button>
          <button onClick={() => setView({ name: 'home' })} className={tabClass(view.name === 'home')}>
            <HomeIcon size={16} /> ホーム
          </button>
          <button onClick={() => setView({ name: 'list' })} className={tabClass(isChars)}>
            <Users size={16} /> キャラクター
          </button>
          <button onClick={() => setView({ name: 'situations' })} className={tabClass(view.name === 'situations')}>
            <BookOpen size={16} /> シチュエーション
          </button>
          <button onClick={() => setView({ name: 'batch' })} className={tabClass(view.name === 'batch')}>
            <Wand2 size={16} /> 一括生成
          </button>
          <button onClick={() => setView({ name: 'gallery' })} className={tabClass(view.name === 'gallery')}>
            <Images size={16} /> ギャラリー
          </button>
          <button onClick={() => setView({ name: 'articles' })} className={tabClass(view.name === 'articles')}>
            <FileText size={16} /> 記事
          </button>
          <button onClick={() => setView({ name: 'settings' })} className={tabClass(view.name === 'settings')}>
            <SettingsIcon size={16} /> 設定
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {view.name === 'home' && (
            <Home onNavigate={(t: HomeTarget) => setView({ name: t } as View)} />
          )}
          {view.name === 'list' && <CharacterList onOpen={(id) => setView({ name: 'detail', id })} />}
          {view.name === 'detail' && (
            <CharacterDetail characterId={view.id} onBack={() => setView({ name: 'list' })} />
          )}
          {view.name === 'situations' && <Situations />}
          {view.name === 'batch' && <BatchCreate onCreated={() => setView({ name: 'gallery' })} />}
          {view.name === 'gallery' && <Gallery />}
          {view.name === 'articles' && <Articles />}
          {view.name === 'settings' && <Settings />}
        </main>
      </div>
    </ToastProvider>
  )
}
