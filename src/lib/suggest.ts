// Name suggestions built from everything ever added, so the same thing is always spelled the
// same way ("Tomato", not "tomato" and "Tomatoes " too). Free text is still allowed.
import type { Item, ShopList } from '../types'

export interface Suggestion {
  name: string
  count: number
  category: string
  qty?: string
  price?: number
}

export const normName = (s: string) => s.trim().replace(/\s+/g, ' ')
export const nameKey = (s: string) => normName(s).toLowerCase()

/** One suggestion per name (case-insensitive), carrying the most recent qty/price/category used. */
export function buildSuggestions(lists: ShopList[]): Suggestion[] {
  const all: Item[] = lists.flatMap((l) => l.items)
  all.sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  const map = new Map<string, Suggestion>()
  for (const it of all) {
    const k = nameKey(it.name)
    const prev = map.get(k)
    map.set(k, {
      name: normName(it.name),
      count: (prev?.count ?? 0) + 1,
      category: it.category,
      qty: it.qty ?? prev?.qty,
      price: it.price ?? prev?.price,
    })
  }
  return [...map.values()]
}

/**
 * Matches for what is typed. Same-category names come first, then most used.
 * With nothing typed it offers the usual items that are not already in the list.
 */
export function matchSuggestions(all: Suggestion[], query: string, category: string, alreadyInList: Set<string>, limit = 6): Suggestion[] {
  const q = nameKey(query)
  const scored = all
    .filter((s) => !alreadyInList.has(nameKey(s.name)))
    .map((s) => {
      const k = nameKey(s.name)
      const rank = !q ? 2 : k.startsWith(q) ? 0 : k.split(' ').some((w) => w.startsWith(q)) ? 1 : k.includes(q) ? 2 : -1
      return { s, rank }
    })
    .filter((x) => x.rank >= 0)
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    const ca = a.s.category === category ? 0 : 1
    const cb = b.s.category === category ? 0 : 1
    if (ca !== cb) return ca - cb
    return b.s.count - a.s.count || a.s.name.localeCompare(b.s.name)
  })
  return (q ? scored : scored.filter((x) => x.s.category === category)).slice(0, limit).map((x) => x.s)
}

/** The spelling to store: reuse an existing suggestion's casing when the name matches it. */
export function canonicalName(typed: string, all: Suggestion[]): string {
  const k = nameKey(typed)
  return all.find((s) => nameKey(s.name) === k)?.name ?? normName(typed)
}
