// Light/dark theme toggle. The whole palette is driven by CSS variables (see
// index.css) that the `.theme-light` class on <html> overrides — so switching is
// just a class toggle, no re-render. Persisted in localStorage (synchronous, so
// it can be applied before first paint with no flash).
export type Theme = 'dark' | 'light'

const KEY = 'nauto9.theme'

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('theme-light', theme === 'light')
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}
