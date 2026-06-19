import { useState } from 'react'
import { Settings as SettingsIcon, Users } from 'lucide-react'
import { ToastProvider } from './components/Toast'
import CharacterList from './views/CharacterList'
import CharacterDetail from './views/CharacterDetail'
import Settings from './views/Settings'

type View = { name: 'list' } | { name: 'detail'; id: number } | { name: 'settings' }

export default function App(): JSX.Element {
  const [view, setView] = useState<View>({ name: 'list' })

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-1 border-b border-ink-700 bg-ink-800/80 px-4 py-2 pl-20 backdrop-blur">
          <span className="mr-3 text-sm font-bold tracking-widest text-accent">nauto9</span>
          <button
            onClick={() => setView({ name: 'list' })}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
              view.name !== 'settings' ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            <Users size={16} /> キャラクター
          </button>
          <button
            onClick={() => setView({ name: 'settings' })}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
              view.name === 'settings' ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            <SettingsIcon size={16} /> 設定
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {view.name === 'list' && (
            <CharacterList onOpen={(id) => setView({ name: 'detail', id })} />
          )}
          {view.name === 'detail' && (
            <CharacterDetail characterId={view.id} onBack={() => setView({ name: 'list' })} />
          )}
          {view.name === 'settings' && <Settings />}
        </main>
      </div>
    </ToastProvider>
  )
}
