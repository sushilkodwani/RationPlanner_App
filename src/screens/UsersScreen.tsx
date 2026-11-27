import { useState } from 'react'
import { Field, Sheet, copyText } from '../components/ui'
import { describeError } from '../lib/github'
import { keyMessage, newCode } from '../lib/keys'
import { go } from '../lib/router'
import { shortId } from '../lib/uuid'
import { ROLE_HELP, ROLE_LABEL, type Role, type User } from '../types'
import { useApp } from '../store/AppContext'

const ROLES: Role[] = ['admin', 'locker', 'editor', 'viewer']

export function UsersScreen() {
  const { users, user: me, can, updateUsers } = useApp()
  const [adding, setAdding] = useState(false)
  const [sharing, setSharing] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!can.admin) return <p className="muted p-6 text-center">Only the admin can see this.</p>
  const admins = users.filter((u) => u.role === 'admin').length

  async function run(fn: (u: User[]) => User[]) {
    setError(null)
    try {
      await updateUsers(fn)
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <div className="px-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <button aria-label="Back" className="btn-soft !px-3" onClick={() => go('settings')}>
          ←
        </button>
        <h1 className="flex-1 text-lg font-bold">People & access keys</h1>
        <button className="btn-primary !py-2" onClick={() => setAdding(true)}>
          + Add
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <ul className="space-y-3">
        {users.map((u) => {
          const lastAdmin = u.role === 'admin' && admins <= 1
          return (
            <li key={u.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">
                  {u.name} {u.id === me?.id && <span className="muted text-xs font-normal">(you)</span>}
                </div>
                <select className="input !w-auto !py-1.5 text-sm" value={u.role} disabled={lastAdmin} onChange={(e) => run((all) => all.map((x) => (x.id === u.id ? { ...x, role: e.target.value as Role } : x)))}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn-soft flex-1 !py-2" onClick={() => setSharing(u)}>
                  🔑 Share key
                </button>
                {!lastAdmin && u.id !== me?.id && (
                  <button
                    className="btn-soft !py-2 text-red-600"
                    onClick={() => {
                      if (confirm(`Remove ${u.name}? Their key will stop working the next time they open the app.`)) void run((all) => all.filter((x) => x.id !== u.id))
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="muted mt-4 text-xs">
        Roles are enforced by the app. Everyone’s key opens the same private data store, so only share keys with people you trust. To lock out everyone at once, make a new repo key on GitHub and share new keys from here.
      </p>
      {adding && <AddSheet onClose={() => setAdding(false)} onAdded={(u) => { setAdding(false); setSharing(u) }} />}
      {sharing && <ShareSheet user={sharing} onClose={() => setSharing(null)} />}
    </div>
  )
}

function AddSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (u: User) => void }) {
  const { users, updateUsers } = useApp()
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setBusy(true)
    setError(null)
    const u: User = { id: shortId(), code: newCode(users.map((x) => x.code)), name: name.trim(), role, createdAt: new Date().toISOString() }
    try {
      await updateUsers((all) => [...all, u])
      onAdded(u)
    } catch (e) {
      setError(describeError(e))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Add person" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Field label="Name">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mom" />
        </Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add and get key'}
        </button>
      </form>
    </Sheet>
  )
}

function ShareSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const { keyFor } = useApp()
  const [copied, setCopied] = useState(false)
  const key = keyFor(user)
  const appUrl = window.location.origin + window.location.pathname
  const message = keyMessage(user.name, key, appUrl)

  return (
    <Sheet title={`Key for ${user.name}`} onClose={onClose}>
      <p className="muted mb-3 text-sm">Send this privately. {user.name} pastes it the first time they open the app.</p>
      <textarea readOnly className="input h-28 resize-none font-mono text-xs" value={key} onFocus={(e) => e.currentTarget.select()} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="btn-soft"
          onClick={async () => {
            setCopied(await copyText(message))
          }}
        >
          {copied ? '✓ Copied' : 'Copy message'}
        </button>
        <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </div>
    </Sheet>
  )
}
