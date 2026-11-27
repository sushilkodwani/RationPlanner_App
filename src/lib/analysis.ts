// Everything on the Analysis tab is computed from the lists, never stored.
import type { Category, ShopList } from '../types'
import { daysBetween, lastMonths, monthKey, monthLabel, WEEKDAYS, parseDate, weekStart, weekLabel, addDays } from './dates'
import { nameKey } from './suggest'

export interface Purchase {
  listId: string
  listName: string
  name: string
  key: string
  category: string
  qty?: string
  price?: number
  date: string
}

export function purchasesOf(lists: ShopList[]): Purchase[] {
  const out: Purchase[] = []
  for (const l of lists)
    for (const i of l.items)
      if (i.done && i.boughtOn)
        out.push({ listId: l.id, listName: l.name, name: i.name, key: nameKey(i.name), category: i.category, qty: i.qty, price: i.price, date: i.boughtOn })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const priced = (ps: Purchase[]) => ps.filter((p) => typeof p.price === 'number')
export const spendOf = (ps: Purchase[]) => sum(priced(ps).map((p) => p.price as number))

export interface MonthRow {
  key: string
  label: string
  spend: number
  count: number
  byCategory: Record<string, number>
}

/** The last `n` months ending at `endKey`, with spend, item count and item count per category. */
export function monthRows(ps: Purchase[], endKey: string, n: number): MonthRow[] {
  return lastMonths(endKey, n).map((key) => {
    const inMonth = ps.filter((p) => monthKey(p.date) === key)
    const byCategory: Record<string, number> = {}
    for (const p of inMonth) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
    return { key, label: monthLabel(key), spend: spendOf(inMonth), count: inMonth.length, byCategory }
  })
}

export interface Slice {
  id: string
  name: string
  spend: number
  count: number
}

export function categorySlices(ps: Purchase[], categories: Category[]): Slice[] {
  const ids = [...new Set([...categories.map((c) => c.id), ...ps.map((p) => p.category)])]
  return ids
    .map((id) => {
      const own = ps.filter((p) => p.category === id)
      return { id, name: categories.find((c) => c.id === id)?.name ?? id, spend: spendOf(own), count: own.length }
    })
    .filter((s) => s.count > 0)
}

export interface ItemStat {
  key: string
  name: string
  category: string
  times: number
  spend: number
  lastDate: string
  /** Average days between purchases (needs at least 2). */
  gapDays?: number
  avgPrice?: number
  minPrice?: number
  maxPrice?: number
}

export function itemStats(ps: Purchase[]): ItemStat[] {
  const groups = new Map<string, Purchase[]>()
  for (const p of ps) groups.set(p.key, [...(groups.get(p.key) ?? []), p])
  return [...groups.values()]
    .map((g) => {
      const dates = [...new Set(g.map((p) => p.date))].sort()
      const prices = priced(g).map((p) => p.price as number)
      const last = g[g.length - 1]
      return {
        key: last.key,
        name: last.name,
        category: last.category,
        times: g.length,
        spend: sum(prices),
        lastDate: dates[dates.length - 1],
        gapDays: dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1) : undefined,
        avgPrice: prices.length ? sum(prices) / prices.length : undefined,
        minPrice: prices.length ? Math.min(...prices) : undefined,
        maxPrice: prices.length ? Math.max(...prices) : undefined,
      }
    })
    .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
}

export interface SeriesPoint {
  key: string
  label: string
  count: number
  spend: number
  /** Average price paid per purchase in the period; undefined when none was priced. */
  avgPrice?: number
}

/** One item's purchases bucketed by week or month, over the last `n` buckets up to `today`. */
export function itemSeries(ps: Purchase[], itemKey: string, by: 'week' | 'month', today: string, n: number): SeriesPoint[] {
  const own = ps.filter((p) => p.key === itemKey)
  const keys: string[] = []
  if (by === 'month') keys.push(...lastMonths(monthKey(today), n))
  else {
    let w = weekStart(today)
    for (let i = 0; i < n; i++) {
      keys.unshift(w)
      w = addDays(w, -7)
    }
  }
  return keys.map((key) => {
    const inB = own.filter((p) => (by === 'month' ? monthKey(p.date) === key : weekStart(p.date) === key))
    const pr = priced(inB).map((p) => p.price as number)
    return {
      key,
      label: by === 'month' ? monthLabel(key) : weekLabel(key),
      count: inB.length,
      spend: sum(pr),
      avgPrice: pr.length ? sum(pr) / pr.length : undefined,
    }
  })
}

export interface Insight {
  icon: string
  text: string
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
export const money = (n: number) => `₹${inr.format(Math.round(n))}`

/** Plain-language ideas drawn from what has been recorded. Most useful first. */
export function insights(lists: ShopList[], ps: Purchase[], categories: Category[], today: string): Insight[] {
  const out: Insight[] = []
  if (!ps.length) return out
  const thisM = monthKey(today)
  const lastM = lastMonths(thisM, 2)[0]
  const stats = itemStats(ps)

  // Restock: usually bought every N days and that many days have passed.
  const due = stats
    .filter((s) => s.times >= 3 && s.gapDays && s.gapDays >= 2)
    .map((s) => ({ s, over: daysBetween(s.lastDate, today) - (s.gapDays as number) }))
    .filter((x) => x.over >= 0)
    .sort((a, b) => b.over - a.over)
    .slice(0, 3)
  for (const { s } of due)
    out.push({ icon: '🛒', text: `${s.name} is usually bought every ~${Math.round(s.gapDays as number)} days. Last bought ${daysBetween(s.lastDate, today)} days ago, so it may be due.` })

  // Pending for a long time.
  const stale = lists
    .filter((l) => !l.locked)
    .flatMap((l) => l.items.filter((i) => !i.done && daysBetween(i.addedAt.slice(0, 10), today) >= 14))
  if (stale.length)
    out.push({ icon: '⏳', text: `${stale.length} item${stale.length === 1 ? ' has' : 's have'} been waiting over 2 weeks to be bought (${stale.slice(0, 3).map((i) => i.name).join(', ')}${stale.length > 3 ? '…' : ''}). Remove what isn't needed.` })

  // Month on month spend.
  const sThis = spendOf(ps.filter((p) => monthKey(p.date) === thisM))
  const sLast = spendOf(ps.filter((p) => monthKey(p.date) === lastM))
  // Only late in the month, when a part-month total can fairly be set against a whole one.
  if (sLast > 0 && sThis > 0 && parseDate(today).getDate() >= 20) {
    const pct = Math.round(((sThis - sLast) / sLast) * 100)
    if (Math.abs(pct) >= 5) out.push({ icon: pct > 0 ? '📈' : '📉', text: `This month's spend so far is ${money(sThis)}, ${Math.abs(pct)}% ${pct > 0 ? 'higher' : 'lower'} than all of ${monthLabel(lastM)} (${money(sLast)}).` })
  }

  // Price creep.
  for (const s of stats) {
    const pr = priced(ps.filter((p) => p.key === s.key)).map((p) => p.price as number)
    if (pr.length >= 3) {
      const latest = pr[pr.length - 1]
      const before = sum(pr.slice(0, -1)) / (pr.length - 1)
      if (before > 0 && latest > before * 1.15) out.push({ icon: '💸', text: `${s.name} cost ${money(latest)} last time, ${Math.round(((latest - before) / before) * 100)}% above your usual ${money(before)}. Worth checking another shop.` })
    }
  }

  // Many small trips for one item inside a month.
  const trips = stats
    .map((s) => {
      const perMonth = new Map<string, number>()
      for (const p of ps.filter((x) => x.key === s.key)) perMonth.set(monthKey(p.date), (perMonth.get(monthKey(p.date)) ?? 0) + 1)
      return { s, max: Math.max(...perMonth.values()) }
    })
    .filter((x) => x.max >= 4)
    .sort((a, b) => b.max - a.max)[0]
  if (trips) out.push({ icon: '🧺', text: `${trips.s.name} was bought ${trips.max} times in one month. Buying a bigger quantity at once may save trips.` })

  // Biggest category.
  const slices = categorySlices(ps, categories).sort((a, b) => b.spend - a.spend)
  if (slices.length > 1 && slices[0].spend > 0) {
    const total = sum(slices.map((s) => s.spend))
    out.push({ icon: '🥦', text: `${slices[0].name} takes ${Math.round((slices[0].spend / total) * 100)}% of everything spent so far.` })
  }

  // Shopping day.
  const days = new Array(7).fill(0)
  for (const p of ps) days[parseDate(p.date).getDay()]++
  const best = days.indexOf(Math.max(...days))
  if (ps.length >= 10) out.push({ icon: '📅', text: `Most shopping happens on ${WEEKDAYS[best]}s (${Math.round((days[best] / ps.length) * 100)}% of purchases).` })

  // Data quality.
  const share = priced(ps).length / ps.length
  if (ps.length >= 10 && share < 0.6) out.push({ icon: '✏️', text: `Only ${Math.round(share * 100)}% of bought items have a price. Adding prices makes the cost charts far more useful.` })

  return out
}
