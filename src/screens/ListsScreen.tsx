import { useState } from 'react'
import { Empty, Field, Sheet } from '../components/ui'
import { defaultListName } from '../lib/dates'
import { money, spendOf, purchasesOf } from '../lib/analysis'
import { go } from '../lib/router'
import { shortId } from '../lib/uuid'
import type { ShopList } from '../types'
import { useApp } from '../store/AppContext'

export function ListsScreen() {
  const { lists, can, loaded } = useApp()
  const [creating, setCreating] = useState(false)

  return (
    <div className="px-4 pb-6">
      {can.edit && (
        <button className="btn-primary mb-4 w-full" onClick={() => setCreating(true)}>
          + New list
        </button>
      )}
      {!loaded && !lists.length && <p className="muted py-10 text-center text-sm">Loading…</p>}
      {loaded && !lists.length && <Empty icon="🧺" title="No lists yet" body={can.edit ? 'Create the first one for this month.' : 'Ask an editor to create one.'} />}
      <div className="space-y-3">
        {lists.map((l) => (
          <ListCard key={l.id} list={l} />
        ))}
      </div>
      {creating && <NewListSheet onClose={() => setCreating(false)} />}
    </div>
  )
}

function ListCard({ list }: { list: ShopList }) {
  const total = list.items.length
  const bought = list.items.filter((i) => i.done).length
  const spend = spendOf(purchasesOf([list]))
  const pct = total ? Math.round((bought / total) * 100) : 0
  return (
    <button className="card block w-full text-left transition active:scale-[0.99]" onClick={() => go(`lists/${list.id}`)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-lg font-semibold">{list.name}</h3>
        {list.locked && <span className="chip bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">🔒 Locked</span>}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted mt-2 flex justify-between text-sm">
        <span>{total ? `${bought} of ${total} bought` : 'Empty'}</span>
        <span>{spend > 0 ? money(spend) : ''}</span>
      </div>
    </button>
  )
}

function NewListSheet({ onClose }: { onClose: () => void }) {
  const { lists, user, dispatch } = useApp()
  const [name, setName] = useState(defaultListName())
  const previous = lists[0]
  const pending = previous ? previous.items.filter((i) => !i.done) : []
  const [carry, setCarry] = useState(pending.length > 0)

  function create() {
    if (!user || !name.trim()) return
    const now = new Date().toISOString()
    const id = shortId()
    const items = carry
      ? pending.map((i) => {
          const copy = { ...i, id: shortId(), addedAt: now, addedBy: user.id }
          return copy
        })
      : []
    dispatch(id, { t: 'create', list: { id, name: name.trim(), createdAt: now, createdBy: user.id, locked: false, items } })
    onClose()
    go(`lists/${id}`)
  }

  return (
    <Sheet title="New list" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <Field label="Name">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {pending.length > 0 && (
          <label className="mb-4 flex items-start gap-3 rounded-xl bg-stone-200/60 p-3 text-sm dark:bg-stone-800">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-green-700" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
            <span>
              Bring over the {pending.length} item{pending.length === 1 ? '' : 's'} not yet bought from <b>{previous.name}</b>
            </span>
          </label>
        )}
        <button className="btn-primary w-full" disabled={!name.trim()}>
          Create list
        </button>
      </form>
    </Sheet>
  )
}
