import { useState } from 'react'
import { describeError } from '../lib/github'
import { useApp } from '../store/AppContext'

/** First screen on a new phone: paste the access key. The very first person also sets the app up. */
export function ConnectScreen() {
  const { connect, setup, notice, clearNotice } = useApp()
  const [key, setKey] = useState('')
  const [step, setStep] = useState<'key' | 'setup'>('key')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    clearNotice()
    try {
      if (step === 'key') {
        const r = await connect(key)
        if (r.status === 'setup') setStep('setup')
      } else {
        await setup(name)
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="top-pad pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <img src="./icon.svg" alt="" className="mx-auto h-20 w-20 rounded-2xl shadow" />
      <h1 className="mt-4 text-center text-2xl font-bold">Ration Planner</h1>
      <p className="muted mt-1 text-center text-sm">One shared list for ration, fruits and vegetables.</p>

      {notice && <p className="mt-6 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{notice}</p>}

      <form onSubmit={submit} className="card mt-6">
        {step === 'key' ? (
          <>
            <label className="label" htmlFor="key">
              Access key
            </label>
            <textarea id="key" className="input h-28 resize-none font-mono text-sm" placeholder="Paste the key your admin sent you" value={key} onChange={(e) => setKey(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <p className="muted mt-2 text-xs">Setting this up for the first time? Paste the repo key you created. You’ll become the admin.</p>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm">The key works and the app has no data yet. You’re the first one here, so you’ll be the <b>admin</b>.</p>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" className="input" autoFocus placeholder="e.g. Kaushik" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-4 w-full" disabled={busy || (step === 'key' ? key.trim().length < 8 : name.trim().length < 1)}>
          {busy ? 'Please wait…' : step === 'key' ? 'Continue' : 'Create the app'}
        </button>
      </form>
    </div>
  )
}
