import { describe, expect, it } from 'vitest'
import type { Item, ShopList } from '../types'
import { applyOp, applyOps, type Op } from './ops'
import { buildSuggestions, canonicalName, matchSuggestions } from './suggest'
import { insights, itemSeries, itemStats, monthRows, purchasesOf } from './analysis'
import { makeKey, parseKey } from './keys'
import { localDate, weekStart } from './dates'

const item = (id: string, name: string, over: Partial<Item> = {}): Item => ({ id, name, category: 'ration', done: false, addedBy: 'u1', addedAt: '2026-11-01T10:00:00Z', ...over })
const list = (items: Item[] = [], over: Partial<ShopList> = {}): ShopList => ({ id: 'l1', name: 'Nov', createdAt: '2026-11-01', createdBy: 'u1', locked: false, items, ...over })
const base = { opId: 'o', listId: 'l1', actor: 'u1', at: 'x' }

describe('ops', () => {
  it('adds idempotently and keeps two people’s different items', () => {
    const a: Op = { ...base, t: 'add', item: item('1', 'Rice') }
    const b: Op = { ...base, t: 'add', item: item('2', 'Dal') }
    const l = applyOps(list(), [a, a, b])!
    expect(l.items.map((i) => i.name)).toEqual(['Rice', 'Dal'])
  })
  it('marks bought with price and date, and undoes', () => {
    const l = applyOp(list([item('1', 'Rice')]), { ...base, t: 'done', id: '1', price: 120, on: '2026-11-05' })!
    expect(l.items[0]).toMatchObject({ done: true, price: 120, boughtOn: '2026-11-05', doneBy: 'u1' })
    const u = applyOp(l, { ...base, t: 'undone', id: '1' })!
    expect(u.items[0].done).toBe(false)
    expect(u.items[0].boughtOn).toBeUndefined()
    expect(u.items[0].price).toBe(120)
  })
  it('keeps the old price when the done price is left empty', () => {
    const l = applyOp(list([item('1', 'Rice', { price: 90 })]), { ...base, t: 'done', id: '1', on: '2026-11-05' })!
    expect(l.items[0].price).toBe(90)
  })
  it('a locked list ignores everything except unlocking', () => {
    const locked = list([item('1', 'Rice')], { locked: true })
    expect(applyOp(locked, { ...base, t: 'add', item: item('2', 'Dal') })).toBe(locked)
    expect(applyOp(locked, { ...base, t: 'delete' })).toBe(locked)
    expect(applyOp(locked, { ...base, t: 'lock', locked: false })!.locked).toBe(false)
  })
  it('edit can clear qty and price', () => {
    const l = applyOp(list([item('1', 'Rice', { qty: '5kg', price: 10 })]), { ...base, t: 'edit', id: '1', patch: { qty: null, price: null } })!
    expect(l.items[0].qty).toBeUndefined()
    expect(l.items[0].price).toBeUndefined()
  })
  it('ops on a deleted list do nothing', () => {
    expect(applyOp(null, { ...base, t: 'add', item: item('1', 'x') })).toBeNull()
  })
})

describe('suggestions', () => {
  const lists = [list([item('1', 'Tomato', { category: 'vegetables', qty: '1kg', price: 40 }), item('2', 'tomato', { category: 'vegetables' }), item('3', 'Rice')])]
  const all = buildSuggestions(lists)
  it('merges names case-insensitively', () => {
    expect(all.filter((s) => s.name.toLowerCase() === 'tomato')).toHaveLength(1)
  })
  it('prefers the typed category and prefix matches', () => {
    expect(matchSuggestions(all, 'to', 'vegetables', new Set())[0].name.toLowerCase()).toBe('tomato')
  })
  it('hides names already in the list', () => {
    expect(matchSuggestions(all, 'ri', 'ration', new Set(['rice']))).toHaveLength(0)
  })
  it('reuses existing casing', () => {
    expect(canonicalName('  TOMATO ', all)).toBe(all.find((s) => s.name.toLowerCase() === 'tomato')!.name)
    expect(canonicalName('Jaggery', all)).toBe('Jaggery')
  })
})

describe('keys', () => {
  it('round-trips a personal key', () => {
    const k = makeKey('ABC234', 'github_pat_11XYZ_abc')
    expect(k).toBe('ABC23411XYZ_abc')
    expect(parseKey(k)).toEqual({ code: 'ABC234', token: 'github_pat_11XYZ_abc' })
  })
  it('accepts a bare token and ignores whitespace', () => {
    expect(parseKey(' github_pat_11XYZ \n_abc ')).toEqual({ token: 'github_pat_11XYZ_abc' })
  })
  it('rejects junk', () => {
    expect(parseKey('short')).toBeNull()
  })
})

describe('analysis', () => {
  const done = (id: string, name: string, on: string, price?: number, category = 'ration') => item(id, name, { done: true, boughtOn: on, price, category })
  const lists = [
    list([done('1', 'Milk', '2026-10-01', 50), done('2', 'Milk', '2026-10-08', 50), done('3', 'Milk', '2026-10-15', 70), done('4', 'Milk', '2026-10-22', 80), done('5', 'Apple', '2026-11-02', 200, 'fruits')]),
  ]
  const ps = purchasesOf(lists)
  it('sums spend per month', () => {
    const rows = monthRows(ps, '2026-11', 2)
    expect(rows.map((r) => r.spend)).toEqual([250, 200])
    expect(rows[1].byCategory).toEqual({ fruits: 1 })
  })
  it('finds purchase gap and price range', () => {
    const milk = itemStats(ps).find((s) => s.key === 'milk')!
    expect(milk.times).toBe(4)
    expect(milk.gapDays).toBe(7)
    expect([milk.minPrice, milk.maxPrice]).toEqual([50, 80])
  })
  it('buckets an item by week', () => {
    const s = itemSeries(ps, 'milk', 'week', '2026-10-22', 4)
    expect(s.map((p) => p.count)).toEqual([1, 1, 1, 1])
    expect(s[3].avgPrice).toBe(80)
  })
  it('suggests restock and price creep', () => {
    const texts = insights(lists, ps, [], '2026-11-10').map((i) => i.text).join('\n')
    expect(texts).toMatch(/Milk is usually bought every ~7 days/)
    expect(texts).toMatch(/Milk cost ₹80/)
  })
})

describe('dates', () => {
  it('uses local parts', () => {
    expect(localDate(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05')
  })
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-27')).toBe('2026-11-23')
  })
})
