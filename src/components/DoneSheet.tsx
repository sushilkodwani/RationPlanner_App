import { useState } from 'react'
import type { Item, ShopList } from '../types'
import { localDate } from '../lib/dates'
import { useApp } from '../store/AppContext'
import { Field, Sheet } from './ui'

/** Asked when an item is ticked: the price paid (optional) and the day it was bought (today unless changed). */
export function DoneSheet({ list, item, onClose }: { list: ShopList; item: Item; onClose: () => void }) {
  const { dispatch } = useApp()
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '')
  const [date, setDate] = useState(localDate())

  function done() {
    const n = parseFloat(price)
    dispatch(list.id, { t: 'done', id: item.id, price: price.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined, on: date || localDate() })
    onClose()
  }

  return (
    <Sheet title={`Bought ${item.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          done()
        }}
      >
        <Field label="Price paid ₹ (optional)" hint={item.qty ? `For ${item.qty}` : undefined}>
          <input className="input" autoFocus type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Purchased on">
          <input className="input" type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <button type="submit" className="btn-primary mt-2 w-full">
          Done
        </button>
      </form>
    </Sheet>
  )
}
