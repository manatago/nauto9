import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export default function Modal({ open, title, onClose, children, wide }: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
      onMouseDown={onClose}
    >
      <div
        className={`mt-10 w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} rounded-xl border border-ink-600 bg-ink-800 shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink-200">{title}</h2>
          <button
            className="rounded p-1 text-ink-500 hover:bg-ink-700 hover:text-ink-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}
