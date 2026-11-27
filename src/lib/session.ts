// What this phone remembers: the access key it was given and small preferences.
// Wrapped in try/catch because storage can be blocked (private windows).

export interface Session {
  token: string
  code?: string
}

const KEY = 'rp.session'

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
    return s && typeof s.token === 'string' ? s : null
  } catch {
    return null
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function getPref<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`rp.pref.${name}`)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function setPref(name: string, value: unknown): void {
  try {
    localStorage.setItem(`rp.pref.${name}`, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/** Where the data lives. Set at build time (GitHub Actions variables), so the UI never asks. */
export const DATA_OWNER = ((import.meta.env.VITE_DATA_OWNER as string | undefined) ?? '').trim()
export const DATA_REPO = ((import.meta.env.VITE_DATA_REPO as string | undefined) ?? '').trim()
export const DEMO = import.meta.env.DEV && DATA_OWNER.toLowerCase() === 'demo'
