// Every change to a list is an "op": a small, serialisable instruction. Ops are
//  - applied on screen at once (optimistic),
//  - kept in a queue on the phone until they reach the repo,
//  - replayed on top of the LATEST copy of the list if someone else saved first.
// That is the whole merge strategy: two people adding different items never clash.
// The lock rule lives here, in one place: a locked list ignores everything except unlocking.
import type { Item, ShopList } from '../types'

export type Op = { opId: string; listId: string; actor: string; at: string } & (
  | { t: 'create'; list: ShopList }
  | { t: 'delete' }
  | { t: 'rename'; name: string }
  | { t: 'lock'; locked: boolean }
  | { t: 'add'; item: Item }
  | { t: 'edit'; id: string; patch: { name?: string; category?: string; qty?: string | null; price?: number | null } }
  | { t: 'remove'; id: string }
  | { t: 'done'; id: string; price?: number; on: string }
  | { t: 'undone'; id: string }
)

export type OpType = Op['t']

/** Returns the list after the op, or null when the list is gone. Pure: never mutates its input. */
export function applyOp(list: ShopList | null, op: Op): ShopList | null {
  if (op.t === 'create') return list ?? op.list // already there: keep it (replay safety)
  if (!list) return null
  if (op.t === 'lock') return { ...list, locked: op.locked, lockedBy: op.locked ? op.actor : undefined }
  if (list.locked) return list // locked lists accept nothing else
  if (op.t === 'delete') return null
  if (op.t === 'rename') return { ...list, name: op.name }

  const items = list.items
  switch (op.t) {
    case 'add':
      return items.some((i) => i.id === op.item.id) ? list : { ...list, items: [...items, op.item] }
    case 'remove':
      return { ...list, items: items.filter((i) => i.id !== op.id) }
    case 'edit':
      return {
        ...list,
        items: items.map((i) => {
          if (i.id !== op.id) return i
          const next: Item = { ...i }
          const p = op.patch
          if (p.name !== undefined) next.name = p.name
          if (p.category !== undefined) next.category = p.category
          if (p.qty !== undefined) {
            if (p.qty) next.qty = p.qty
            else delete next.qty
          }
          if (p.price !== undefined) {
            if (p.price !== null) next.price = p.price
            else delete next.price
          }
          return next
        }),
      }
    case 'done':
      return {
        ...list,
        items: items.map((i) => {
          if (i.id !== op.id) return i
          const next: Item = { ...i, done: true, boughtOn: op.on, doneBy: op.actor }
          if (op.price !== undefined) next.price = op.price
          return next
        }),
      }
    case 'undone':
      return {
        ...list,
        items: items.map((i) => {
          if (i.id !== op.id) return i
          const next: Item = { ...i, done: false }
          delete next.boughtOn
          delete next.doneBy
          return next
        }),
      }
  }
}

export function applyOps(list: ShopList | null, ops: Op[]): ShopList | null {
  return ops.reduce<ShopList | null>((l, op) => applyOp(l, op), list)
}

/** First line of the commit message. The notifier doesn't parse it; people read it in git history. */
export function summarize(ops: Op[], listName: string): string {
  if (ops.length === 1) {
    const o = ops[0]
    switch (o.t) {
      case 'create':
        return `Create list ${o.list.name}`
      case 'delete':
        return `Delete list ${listName}`
      case 'rename':
        return `Rename list to ${o.name}`
      case 'lock':
        return `${o.locked ? 'Lock' : 'Unlock'} ${listName}`
      case 'add':
        return `Add ${o.item.name} to ${listName}`
      default:
        return `Update ${listName}`
    }
  }
  return `${ops.length} changes in ${listName}`
}
