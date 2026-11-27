import { useEffect, useRef, useState } from 'react'
import { APP_VERSION, fetchDeployedVersion, reloadToLatest } from '../lib/version'
import { useApp } from '../store/AppContext'

const MIN_GAP_MS = 30_000
const EVERY_MS = 30 * 60_000

/** Asks to update when a newer build is deployed. Unsent changes are saved first. */
export function UpdatePrompt() {
  const { flush } = useApp()
  const [latest, setLatest] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const last = useRef(0)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    async function check() {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last.current < MIN_GAP_MS) return
      last.current = now
      const deployed = await fetchDeployedVersion()
      if (deployed && deployed !== APP_VERSION) setLatest(deployed)
    }
    void check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    const t = setInterval(check, EVERY_MS)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('online', check)
      clearInterval(t)
    }
  }, [])

  if (!latest) return null

  async function update() {
    setBusy(true)
    setError(null)
    if (!(await flush())) {
      setError('Your latest change couldn’t be saved yet. Check the connection and tap Update again.')
      setBusy(false)
      return
    }
    await reloadToLatest()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-stone-900">
        <div className="text-4xl">✨</div>
        <h2 className="mt-3 text-lg font-semibold">New version available</h2>
        <p className="muted mt-2 text-sm">Update to get the latest features and fixes.</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-5 w-full" disabled={busy} onClick={update}>
          {busy ? 'Updating…' : 'Update now'}
        </button>
      </div>
    </div>
  )
}
