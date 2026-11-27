import { useMemo, useState } from 'react'
import { DoneSheet } from '../components/DoneSheet'
import { ItemSheet } from '../components/ItemSheet'
import { Empty, Field, Sheet, copyText } from '../components/ui'
import { money } from '../lib/analysis'
import { dayLabel } from '../lib/dates'
import { go } from '../lib/router'
import type { Item, ShopList } from '../types'
import { useApp } from '../store/AppContext'

export function ListScreen({ id, cat }: { id: string; cat: string | null }) {
  const { lists, tabs, users, can, dispatch, loaded } = useApp()
  const list = lists.find((l) => l.id === id)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [buying, setBuying] = useState<Item | null>(null)
  const [menu, setMenu] = useState(false)

  // Categories on the tabs, plus any archived one that still has items in this list.
  const cats = useMemo(() => {
    if (!list) return tabs
    const extra = list.items.map((i) => i.category).filter((c) => !tabs.some((t) => t.id === c))
    return [...tabs, ...[...new Set(extra)].map((c) => ({ id: c, name: c }))]
  }, [tabs, list])

  if (!list) {
    return (
      <div className="top-pad px-4">
        <button className="btn-soft mb-4" onClick={() => go('lists', true)}>
          ← Lists
        </button>
        {loaded ? <Empty icon="🤷" title="This list is gone" body="It may have been deleted." /> : <p className="muted py-10 text-center text-sm">Loading…</p>}
      </div>
    )
  }

  const active = cats.find((c) => c.id === cat)?.id ?? cats[0]?.id ?? ''
  const items = list.items.filter((i) => i.category === active)
  const pending = items.filter((i) => !i.done)
  const bought = items.filter((i) => i.done).sort((a, b) => (b.boughtOn ?? '').localeCompare(a.boughtOn ?? ''))
  const nameOf = (uid?: string) => users.find((u) => u.id === uid)?.name
  const canEdit = can.edit && !list.locked
  const total = list.items.length
  const doneCount = list.items.filter((i) => i.done).length
  const spent = list.items.reduce((s, i) => s + (i.done && i.price ? i.price : 0), 0)

  function toggle(item: Item) {
    if (!canEdit) return
    if (item.done) {
      if (confirm(`Mark ${item.name} as not bought?`)) dispatch(list!.id, { t: 'undone', id: item.id })
    } else setBuying(item)
  }

  return (
    <div className="pb-6">
      <div className="top-pad-sm sticky top-0 z-20 border-b border-stone-200/70 bg-stone-100 px-4 pb-3 dark:border-stone-800 dark:bg-stone-950">
        <div className="flex items-center gap-2">
          <button aria-label="Back" className="btn-soft !px-3" onClick={() => go('lists')}>
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{list.name}</h1>
            <p className="muted text-xs">
              {doneCount} of {total} bought{spent > 0 ? ` · ${money(spent)}` : ''}
            </p>
          </div>
          {can.lock && (
            <button
              aria-label={list.locked ? 'Unlock list' : 'Lock list'}
              className={`btn-soft !px-3 ${list.locked ? '!bg-amber-200 dark:!bg-amber-900/60' : ''}`}
              onClick={() => {
                if (list.locked || confirm('Lock this list? Nobody will be able to change it until it is unlocked.')) dispatch(list.id, { t: 'lock', locked: !list.locked })
              }}
            >
              {list.locked ? '🔒' : '🔓'}
            </button>
          )}
          <button aria-label="More" className="btn-soft !px-3" onClick={() => setMenu(true)}>
            ⋯
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
          {cats.map((c) => {
            const left = list.items.filter((i) => i.category === c.id && !i.done).length
            const on = c.id === active
            return (
              <button key={c.id} role="tab" aria-selected={on} onClick={() => go(`lists/${list.id}?cat=${encodeURIComponent(c.id)}`, true)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${on ? 'bg-green-700 text-white dark:bg-green-600' : 'bg-white text-stone-700 ring-1 ring-stone-200 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-800'}`}>
                {c.name}
                {left > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-xs ${on ? 'bg-white/25' : 'bg-stone-200 dark:bg-stone-700'}`}>{left}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 pt-3">
        {list.locked && (
          <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            🔒 Locked{nameOf(list.lockedBy) ? ` by ${nameOf(list.lockedBy)}` : ''}. {can.lock ? 'Tap the lock to edit again.' : 'Nobody can edit until it is unlocked.'}
          </p>
        )}
        {canEdit && active && (
          <button className="btn-primary mb-3 w-full" onClick={() => setAdding(true)}>
            + Add item
          </button>
        )}

        {!items.length && <Empty icon="🛒" title="Nothing here yet" body={canEdit ? 'Tap “Add item” to start.' : undefined} />}

        <ul className="space-y-2">
          {pending.map((i) => (
            <ItemRow key={i.id} item={i} canEdit={canEdit} onToggle={() => toggle(i)} onOpen={() => canEdit && setEditing(i)} />
          ))}
        </ul>

        {bought.length > 0 && (
          <>
            <h2 className="label mb-2 mt-5">Bought ({bought.length})</h2>
            <ul className="space-y-2">
              {bought.map((i) => (
                <ItemRow key={i.id} item={i} canEdit={canEdit} by={nameOf(i.doneBy)} onToggle={() => toggle(i)} onOpen={() => canEdit && setEditing(i)} />
              ))}
            </ul>
          </>
        )}
      </div>

      {adding && <ItemSheet list={list} category={active} onClose={() => setAdding(false)} />}
      {editing && <ItemSheet list={list} category={editing.category} item={list.items.find((i) => i.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
      {buying && <DoneSheet list={list} item={buying} onClose={() => setBuying(null)} />}
      {menu && <MenuSheet list={list} cats={cats} onClose={() => setMenu(false)} />}
    </div>
  )
}

function ItemRow({ item, canEdit, by, onToggle, onOpen }: { item: Item; canEdit: boolean; by?: string; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className={`card flex items-center gap-3 !p-3 ${item.done ? 'opacity-70' : ''}`}>
      <button
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.done ? `${item.name} bought` : `Mark ${item.name} bought`}
        disabled={!canEdit}
        onClick={onToggle}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-lg transition ${item.done ? 'border-green-600 bg-green-600 text-white' : 'border-stone-300 dark:border-stone-600'} ${canEdit ? '' : 'opacity-60'}`}
      >
        {item.done && '✓'}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className={`truncate font-medium ${item.done ? 'line-through' : ''}`}>{item.name}</div>
        <div className="muted truncate text-xs">
          {[item.qty, item.done && item.boughtOn ? `bought ${dayLabel(item.boughtOn)}` : '', by && item.done ? `by ${by}` : ''].filter(Boolean).join(' · ')}
        </div>
      </button>
      {item.price != null && <div className="shrink-0 text-sm font-semibold">{money(item.price)}</div>}
    </li>
  )
}

function MenuSheet({ list, cats, onClose }: { list: ShopList; cats: { id: string; name: string }[]; onClose: () => void }) {
  const { can, dispatch } = useApp()
  const [name, setName] = useState(list.name)
  const [copied, setCopied] = useState(false)
  const canEdit = can.edit && !list.locked

  async function copy() {
    const lines = [`*${list.name}*`]
    for (const c of cats) {
      const todo = list.items.filter((i) => i.category === c.id && !i.done)
      if (!todo.length) continue
      lines.push('', `*${c.name}*`, ...todo.map((i) => `• ${i.name}${i.qty ? ` (${i.qty})` : ''}`))
    }
    const text = lines.join('\n')
    if (navigator.share) await navigator.share({ text }).catch(() => {})
    else setCopied(await copyText(text))
  }

  return (
    <Sheet title="List" onClose={onClose}>
      {canEdit && (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && name.trim() !== list.name) dispatch(list.id, { t: 'rename', name: name.trim() })
            onClose()
          }}
        >
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn-soft w-full">Rename</button>
        </form>
      )}
      <button className="btn-soft mb-3 w-full" onClick={copy}>
        {copied ? '✓ Copied' : '📤 Share what is left to buy'}
      </button>
      {can.lock && !list.locked && (
        <button
          className="btn-danger w-full"
          onClick={() => {
            if (confirm(`Delete “${list.name}” and everything in it? This can’t be undone from the app.`)) {
              dispatch(list.id, { t: 'delete' })
              onClose()
              go('lists', true)
            }
          }}
        >
          Delete list
        </button>
      )}
    </Sheet>
  )
}
