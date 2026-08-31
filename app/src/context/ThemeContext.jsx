import { createContext, useContext, useState } from 'react'
import { THEMES, DEFAULT_THEME } from '../data/themes.js'

const LAST_KEY = 'tommys-quests-theme'

// Theme is a per-session choice: the picker shows on every page load. The last
// pick is remembered only to highlight it as the suggested card.
export function loadLastTheme() {
  try {
    const v = localStorage.getItem(LAST_KEY)
    return v && THEMES[v] ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

const ThemeContext = createContext(null)

// `?theme=ninja` skips the picker — handy for dev links and screenshots
function themeFromUrl() {
  try {
    const v = new URLSearchParams(window.location.search).get('theme')
    return v && THEMES[v] ? v : null
  } catch {
    return null
  }
}

export function ThemeProvider({ children, initial = null }) {
  const [themeId, setThemeId] = useState(() => initial ?? themeFromUrl()) // null until he picks
  const [lastTheme] = useState(loadLastTheme)

  const setTheme = (id) => {
    if (!THEMES[id]) return
    setThemeId(id)
    try { localStorage.setItem(LAST_KEY, id) } catch { /* ignore */ }
  }
  const clearTheme = () => setThemeId(null)

  const theme = themeId ? THEMES[themeId] : null
  return (
    <ThemeContext.Provider value={{ theme, themeId, lastTheme, setTheme, clearTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
