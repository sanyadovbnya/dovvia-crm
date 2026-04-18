import { useEffect, useState } from 'react'

const KEY = 'dovvia_theme'
const EVENT = 'dovvia:theme-change'

function currentTheme() {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(KEY, theme)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }))
}

export function initTheme() {
  const stored = localStorage.getItem(KEY)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = stored || (prefersDark ? 'dark' : 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')
  return theme
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    const onChange = e => setTheme(e.detail || currentTheme())
    const onStorage = e => { if (e.key === KEY && e.newValue) setTheme(e.newValue) }
    window.addEventListener(EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  function toggle() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggle, setTheme: t => applyTheme(t) }
}
