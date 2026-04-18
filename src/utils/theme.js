import { useEffect, useState } from 'react'

const KEY = 'dovvia_theme'

export function initTheme() {
  const stored = localStorage.getItem(KEY)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = stored || (prefersDark ? 'dark' : 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')
  return theme
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(KEY, theme)
  }, [theme])

  function toggle() {
    setThemeState(t => (t === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggle, setTheme: setThemeState }
}
