import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { STRINGS, DEFAULT_LANG, LANGS } from '../i18n/strings.js'

const LANG_KEY = 'tommys-quests-lang'

function loadLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return LANGS.includes(v) ? v : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG
  }
}

const LangContext = createContext(null)

/**
 * Language + direction for the whole shell. Hebrew flips the app to RTL;
 * English keeps the original LTR game look. Missing keys fall back to the
 * other language, then to the key itself, so a typo is visible but harmless.
 */
export function LangProvider({ children }) {
  const [lang, setLangState] = useState(loadLang)
  const dir = lang === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = useCallback((v) => {
    if (!LANGS.includes(v)) return
    setLangState(v)
    try { localStorage.setItem(LANG_KEY, v) } catch { /* ignore */ }
  }, [])

  const t = useCallback((key, params) => {
    const entry = STRINGS[lang]?.[key] ?? STRINGS[lang === 'he' ? 'en' : 'he']?.[key]
    if (entry === undefined) return key
    return typeof entry === 'function' ? entry(params ?? {}) : entry
  }, [lang])

  const value = useMemo(() => ({
    lang,
    dir,
    isHe: lang === 'he',
    setLang,
    toggleLang: () => setLang(lang === 'he' ? 'en' : 'he'),
    t,
  }), [lang, dir, setLang, t])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}
