import { createContext, ReactNode, useCallback, useContext, useState } from 'react'
import { createPortal } from 'react-dom'

type ToastKind = 'info' | 'error' | 'success'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  push: (message: string, kind?: ToastKind) => void
  error: (message: string) => void
  success: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId++
    setItems((xs) => [...xs, { id, kind, message }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000)
  }, [])

  const value: ToastApi = {
    push,
    error: (m) => push(m, 'error'),
    success: (m) => push(m, 'success')
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
          {items.map((t) => (
            <div
              key={t.id}
              className={`rounded-lg border px-4 py-2 text-sm shadow-lg ${
                t.kind === 'error'
                  ? 'border-red-500/40 bg-red-950/80 text-red-200'
                  : t.kind === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/80 text-emerald-200'
                    : 'border-ink-600 bg-ink-700 text-ink-100'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside provider')
  return ctx
}
