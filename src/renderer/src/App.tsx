import { useState } from 'react'
import { BookOpen, Images, Settings as SettingsIcon, Users, Wand2 } from 'lucide-react'
import { ToastProvider } from './components/Toast'
import CharacterList from './views/CharacterList'
import CharacterDetail from './views/CharacterDetail'
import Situations from './views/Situations'
import BatchCreate from './views/BatchCreate'
import Gallery from './views/Gallery'
import Settings from './views/Settings'

type View =
  | { name: 'list' }
  | { name: 'detail'; id: number }
  | { name: 'situations' }
  | { name: 'batch' }
  | { name: 'gallery' }
  | { name: 'settings' }

export default function App(): JSX.Element {
  const [view, setView] = useState<View>({ name: 'list' })

  const isChars = view.name === 'list' || view.name === 'detail'
  const tabClass = (active: boolean): string =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
      active ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'
    }`

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-1 border-b border-ink-700 bg-ink-800/80 px-4 py-2 pl-20 backdrop-blur">
          <span className="mr-3 text-sm font-bold tracking-widest text-accent">nauto9</span>
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
          <button onClick={() => setView({ name: 'settings' })} className={tabClass(view.name === 'settings')}>
            <SettingsIcon size={16} /> 設定
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {view.name === 'list' && <CharacterList onOpen={(id) => setView({ name: 'detail', id })} />}
          {view.name === 'detail' && (
            <CharacterDetail characterId={view.id} onBack={() => setView({ name: 'list' })} />
          )}
          {view.name === 'situations' && <Situations />}
          {view.name === 'batch' && <BatchCreate onCreated={() => setView({ name: 'gallery' })} />}
          {view.name === 'gallery' && <Gallery />}
          {view.name === 'settings' && <Settings />}
        </main>
      </div>
    </ToastProvider>
  )
}
