import { Component, ErrorInfo, ReactNode } from 'react'

interface State {
  error: Error | null
  info: string
}

// Converts a render/commit crash into a visible, recoverable screen instead of
// a blank (black) window, and logs the error to the console (forwarded to the
// main process terminal via webContents 'console-message').
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">画面の描画でエラーが発生しました</h1>
        <p className="max-w-2xl break-words rounded-md bg-ink-800 px-4 py-2 font-mono text-xs text-red-200">
          {error.message}
        </p>
        <button
          onClick={() => location.reload()}
          className="rounded-md bg-accent/20 px-4 py-2 text-sm text-accent ring-1 ring-accent/50 hover:bg-accent/30"
        >
          再読み込み
        </button>
        <details className="max-h-64 max-w-2xl overflow-auto text-left">
          <summary className="cursor-pointer text-xs text-ink-500">詳細（スタック）</summary>
          <pre className="whitespace-pre-wrap text-[11px] text-ink-500">
            {error.stack}
            {info}
          </pre>
        </details>
      </div>
    )
  }
}
