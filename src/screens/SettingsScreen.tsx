import { useState } from 'react'
import { NotificationsCard } from '../components/NotificationsCard'
import { Field, Segmented, Sheet } from '../components/ui'
import { purchasesOf } from '../lib/analysis'
import { describeError } from '../lib/github'
import { go } from '../lib/router'
import { APP_VERSION } from '../lib/version'
import { ROLE_HELP, ROLE_LABEL } from '../types'
import { useApp } from '../store/AppContext'
import { useTheme } from '../store/ThemeContext'
import { shortId } from '../lib/uuid'

export function SettingsScreen() {
  const { user, role, can, sync, logout } = useApp()
  const { pref, setPref } = useTheme()
  const [replacing, setReplacing] = useState(false)

  return (
    <div className="space-y-4 px-4 pb-8">
      <section className="card">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-700 text-xl font-bold text-white">{(user?.name ?? '?').charAt(0).toUpperCase()}</div>
          <div>
            <div className="font-semibold">{user?.name}</div>
            <div className="muted text-sm">{ROLE_LABEL[role]}</div>
          </div>
        </div>
        <p className="muted mt-3 text-xs">{ROLE_HELP[role]}</p>
      </section>

      <section className="card">
        <div className="mb-3 font-medium">Appearance</div>
        <Segmented value={pref} onChange={setPref} options={[{ id: 'system', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
      </section>

      <section className="card">
        <NotificationsCard />
      </section>

      {can.admin && (
        <>
          <section className="card">
            <button className="flex w-full items-center justify-between text-left" onClick={() => go('settings/users')}>
              <div>
                <div className="font-medium">People & access keys</div>
                <div className="muted text-sm">Add people, set their role, share their key</div>
              </div>
              <span className="muted">›</span>
            </button>
          </section>
          <CategoriesCard />
        </>
      )}

      <section className="card space-y-3">
        <button className="flex w-full items-center justify-between text-left" onClick={() => setReplacing(true)}>
          <div>
            <div className="font-medium">Replace access key</div>
            <div className="muted text-sm">Use this when your admin sends a new key</div>
          </div>
          <span className="muted">›</span>
        </button>
        <hr className="border-stone-200 dark:border-stone-800" />
        <ExportRow />
      </section>

      <section className="card">
        <button
          className="w-full text-left font-medium text-red-600"
          onClick={async () => {
            if (sync.pending > 0 && !confirm(`${sync.pending} change${sync.pending === 1 ? ' hasn’t' : 's haven’t'} been saved yet. Log out anyway?`)) return
            await logout()
          }}
        >
          Log out
        </button>
      </section>

      <p className="muted text-center text-xs">Version {APP_VERSION}</p>
      {replacing && <ReplaceKeySheet onClose={() => setReplacing(false)} />}
    </div>
  )
}

function ReplaceKeySheet({ onClose }: { onClose: () => void }) {
  const { replaceKey } = useApp()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title="Replace access key" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await replaceKey(key)
            onClose()
          } catch (err) {
            setError(describeError(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="New access key">
          <textarea className="input h-28 resize-none font-mono text-sm" autoFocus value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} autoCapitalize="off" />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || key.trim().length < 8}>
          {busy ? 'Checking…' : 'Replace key'}
        </button>
      </form>
    </Sheet>
  )
}

function ExportRow() {
  const { lists, config } = useApp()
  function download() {
    const name = (id: string) => config.categories.find((c) => c.id === id)?.name ?? id
    const q = (s: string | number | undefined) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const rows = [['Date', 'List', 'Item', 'Category', 'Qty', 'Price'].join(',')]
    for (const p of purchasesOf(lists)) rows.push([p.date, q(p.listName), q(p.name), q(name(p.category)), q(p.qty), p.price ?? ''].join(','))
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'purchases.csv' })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <button className="flex w-full items-center justify-between text-left" onClick={download}>
      <div>
        <div className="font-medium">Export purchases</div>
        <div className="muted text-sm">Download everything bought as a spreadsheet (CSV)</div>
      </div>
      <span className="muted">⬇</span>
    </button>
  )
}

function CategoriesCard() {
  const { config, updateCategories } = useApp()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function run(fn: Parameters<typeof updateCategories>[0]) {
    setError(null)
    try {
      await updateCategories(fn)
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <section className="card">
      <div className="mb-1 font-medium">Categories</div>
      <p className="muted mb-3 text-sm">These are the tabs inside every list. Hiding one keeps the old items and charts.</p>
      <ul className="space-y-2">
        {config.categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              className={`input !py-2 ${c.archived ? 'opacity-50' : ''}`}
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== c.name) void run((cs) => cs.map((x) => (x.id === c.id ? { ...x, name: v } : x)))
              }}
            />
            <button className="btn-soft !px-3 !py-2 text-xs" onClick={() => run((cs) => cs.map((x) => (x.id === c.id ? { ...x, archived: !x.archived } : x)))}>
              {c.archived ? 'Show' : 'Hide'}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const v = name.trim()
          if (!v) return
          if (config.categories.some((c) => c.name.toLowerCase() === v.toLowerCase())) return setError('That category already exists.')
          await run((cs) => [...cs, { id: shortId().slice(0, 8), name: v }])
          setName('')
        }}
      >
        <input className="input !py-2" placeholder="New category, e.g. Dairy" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary !py-2" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
