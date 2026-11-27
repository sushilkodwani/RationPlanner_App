import { describe, expect, it } from 'vitest'
import { buildPayload, describeList, diffList, isEmpty } from './diff.mjs'

const item = (id, name, over = {}) => ({ id, name, category: 'ration', done: false, ...over })
const list = (items, over = {}) => ({ id: 'l1', name: 'November', locked: false, items, ...over })

describe('diffList', () => {
  it('reports adds, buys and removals by item id', () => {
    const before = list([item('1', 'Rice'), item('2', 'Dal'), item('3', 'Salt')])
    const after = list([item('1', 'Rice', { done: true }), item('2', 'Dal'), item('4', 'Oil'), item('5', 'Tea')])
    const d = diffList(before, after)
    expect(d.added).toEqual(['Oil', 'Tea'])
    expect(d.bought).toEqual(['Rice'])
    expect(d.removed).toEqual(['Salt'])
  })
  it('an item added and then removed leaves nothing', () => {
    expect(isEmpty(diffList(list([item('1', 'Rice')]), list([item('1', 'Rice')])))).toBe(true)
  })
  it('detects lock, rename, create and delete', () => {
    expect(diffList(list([]), list([], { locked: true })).locked).toBe(true)
    expect(diffList(list([]), list([], { name: 'Nov 2026' })).renamedFrom).toBe('November')
    expect(diffList(null, list([item('1', 'x')])).created).toBe(true)
    expect(diffList(list([]), null).deleted).toBe(true)
  })
  it('detects edits to price or qty', () => {
    expect(diffList(list([item('1', 'Rice', { price: 10 })]), list([item('1', 'Rice', { price: 12 })])).edited).toEqual(['Rice'])
  })
})

describe('buildPayload', () => {
  it('summarises one list for one person', () => {
    const diff = diffList(list([]), list([item('1', 'Rice'), item('2', 'Dal'), item('3', 'Oil'), item('4', 'Tea'), item('5', 'Salt')]))
    const p = buildPayload([{ id: 'l1', diff }], ['Mom'])
    expect(p.title).toBe('Mom updated November')
    expect(p.body).toBe('Added 5: Rice, Dal, Oil, Tea +1 more')
    expect(p.url).toBe('#/lists/l1')
  })
  it('names several people and several lists', () => {
    const a = diffList(list([]), list([item('1', 'Rice')]))
    const b = diffList(list([], { name: 'Dec' }), list([item('2', 'Dal')], { name: 'Dec' }))
    const p = buildPayload([{ id: 'l1', diff: a }, { id: 'l2', diff: b }], ['Mom', 'Wife', 'Me'])
    expect(p.title).toBe('Mom, Wife and Me updated 2 lists')
    expect(p.url).toBe('#/lists')
  })
  it('sends nothing when nothing net changed', () => {
    expect(buildPayload([{ id: 'l1', diff: diffList(list([]), list([])) }], ['Mom'])).toBeNull()
  })
  it('describes a lock', () => {
    expect(describeList(diffList(list([]), list([], { locked: true })))).toEqual(['🔒 Locked the list'])
  })
})
