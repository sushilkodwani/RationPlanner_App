import { useMemo, useState } from 'react'
import type { Item, ShopList } from '../types'
import { localDate } from '../lib/dates'
import { buildSuggestions, canonicalName, matchSuggestions, nameKey, normName, type Suggestion } from '../lib/suggest'
import { shortId } from '../lib/uuid'
import { useApp } from '../store/AppContext'
import { Field, Sheet } from './ui'

const toNumber = (s: string): number | undefined => {
  const n = parseFloat(s)
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Add a new item, or edit an existing one. Names follow suggestions but any new name is allowed. */
export function ItemSheet({ list, category, item, onClose }: { list: ShopList; category: string; item?: Item; onClose: () => void }) {
  const { lists, tabs, user, dispatch } = useApp()
  const editing = !!item
  const [name, setName] = useState(item?.name ?? '')
  const [qty, setQty] = useState(item?.qty ?? '')
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '')
  const [cat, setCat] = useState(item?.category ?? category)
  const [date, setDate] = useState(item?.boughtOn ?? localDate())
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  const all = useMemo(() => buildSuggestions(lists), [lists])
  const others = list.items.filter((i) => i.id !== item?.id)
  const pendingKeys = new Set(others.filter((i) => !i.done).map((i) => nameKey(i.name)))
  const key = nameKey(name)
  const duplicate = key !== '' && pendingKeys.has(key)
  const boughtAlready = key !== '' && !duplicate ? others.find((i) => i.done && nameKey(i.name) === key) : undefined
  const matches = useMemo(() => matchSuggestions(all, name, cat, pendingKeys, 6), [all, name, cat, list.items]) // eslint-disable-line react-hooks/exhaustive-deps
  const exact = all.some((s) => nameKey(s.name) === key)

  function pick(s: Suggestion) {
    setName(s.name)
    setOpen(false)
  }

  function save(another: boolean) {
    if (!user || !normName(name) || duplicate) return
    const finalName = canonicalName(name, all)
    const q = qty.trim()
    const p = toNumber(price)
    if (item) {
      dispatch(list.id, { t: 'edit', id: item.id, patch: { name: finalName, category: cat, qty: q || null, price: p ?? null } })
      if (item.done) dispatch(list.id, { t: 'done', id: item.id, price: p, on: date })
      onClose()
      return
    }
    const fresh: Item = { id: shortId(), name: finalName, category: cat, done: false, addedBy: user.id, addedAt: new Date().toISOString() }
    if (q) fresh.qty = q
    if (p !== undefined) fresh.price = p
    dispatch(list.id, { t: 'add', item: fresh })
    if (another) {
      setAdded(finalName)
      setName('')
      setQty('')
      setPrice('')
    } else onClose()
  }

  const canSave = !!normName(name) && !duplicate

  return (
    <Sheet title={editing ? 'Edit item' : 'Add item'} onClose={onClose}>
      {added && <p className="mb-3 rounded-xl bg-green-100 px-3 py-2 text-sm text-green-800 dark:bg-green-900/40 dark:text-green-200">✓ Added {added}. Add the next one.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
      >
        <div className="relative mb-3">
          <span className="label">Item</span>
          <input
            className="input"
            autoFocus
            autoComplete="off"
            autoCapitalize="words"
            placeholder="e.g. Basmati rice"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && matches.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-800">
              {matches.map((s) => (
                <li key={s.name}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-700" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                    <span>{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {duplicate && <p className="mt-1 text-sm text-red-600">Already in this list. No need to add it twice.</p>}
          {!duplicate && boughtAlready && <p className="muted mt-1 text-xs">Already bought in this list{boughtAlready.boughtOn ? ` on ${boughtAlready.boughtOn}` : ''}. Adding it again is fine.</p>}
          {!duplicate && !exact && key !== '' && <p className="muted mt-1 text-xs">New item. It will be suggested next time.</p>}
        </div>

        {editing && (
          <Field label="Category">
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              {[...tabs, ...(tabs.some((t) => t.id === cat) ? [] : [{ id: cat, name: cat }])].map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Qty (optional)">
            <input className="input" placeholder="2 kg" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Price ₹ (optional)">
            <input className="input" type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>

        {editing && item?.done && (
          <Field label="Bought on">
            <input className="input" type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}

        <div className="mt-2 flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={!canSave}>
            Save
          </button>
          {!editing && (
            <button type="button" className="btn-soft" disabled={!canSave} onClick={() => save(true)}>
              Save & add next
            </button>
          )}
        </div>
        {editing && (
          <button
            type="button"
            className="mt-3 w-full text-sm font-medium text-red-600"
            onClick={() => {
              if (item && confirm(`Remove ${item.name} from this list?`)) {
                dispatch(list.id, { t: 'remove', id: item.id })
                onClose()
              }
            }}
          >
            Remove from list
          </button>
        )}
      </form>
    </Sheet>
  )
}
