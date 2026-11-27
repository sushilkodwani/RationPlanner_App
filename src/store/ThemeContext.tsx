import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'rp.theme'

interface Ctx {
  pref: ThemePref
  isDark: boolean
  setPref(p: ThemePref): void
}
const ThemeCtx = createContext<Ctx>({ pref: 'system', isDark: false, setPref: () => {} })
export const useTheme = () => useContext(ThemeCtx)

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    try {
      const v = localStorage.getItem(KEY)
      return v === 'light' || v === 'dark' ? v : 'system'
    } catch {
      return 'system'
    }
  })
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const isDark = pref === 'dark' || (pref === 'system' && sysDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0c0a09' : '#15803d')
  }, [isDark])

  const setPref = (p: ThemePref) => {
    setPrefState(p)
    try {
      localStorage.setItem(KEY, p)
    } catch {
      // ignore
    }
  }
  return <ThemeCtx.Provider value={{ pref, isDark, setPref }}>{children}</ThemeCtx.Provider>
}
