import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Surface otherwise-silent failures (these are what turn into a black screen).
window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[window error]', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledrejection]', e.reason)
})

// Without this, dropping a file anywhere outside the gallery drop zone makes
// Electron navigate the window to that file (white screen). Swallow stray drops.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
