// Pure helpers for the notifier: what changed between two copies of a list, in words.
// Kept free of git/network code so it can be unit-tested.

const MAX_NAMES = 4

const byId = (items) => new Map((items ?? []).map((i) => [i.id, i]))

/** What changed in one list file between `before` (or null) and `after` (or null). */
export function diffList(before, after) {
  const d = { added: [], removed: [], bought: [], unbought: [], edited: [] }
  if (!before && !after) return null
  if (!before) return { ...d, created: true, name: after.name, added: after.items.map((i) => i.name) }
  if (!after) return { ...d, deleted: true, name: before.name }

  const out = { ...d, name: after.name }
  if (before.name !== after.name) out.renamedFrom = before.name
  if (!!before.locked !== !!after.locked) out.locked = !!after.locked

  const b = byId(before.items)
  const a = byId(after.items)
  for (const [id, item] of a) {
    const old = b.get(id)
    if (!old) out.added.push(item.name)
    else if (!old.done && item.done) out.bought.push(item.name)
    else if (old.done && !item.done) out.unbought.push(item.name)
    else if (old.name !== item.name || old.qty !== item.qty || old.price !== item.price || old.category !== item.category || old.boughtOn !== item.boughtOn) out.edited.push(item.name)
  }
  for (const [id, item] of b) if (!a.has(id)) out.removed.push(item.name)
  return out
}

export const isEmpty = (d) => !d || !(d.created || d.deleted || d.renamedFrom || d.locked !== undefined || d.added.length || d.removed.length || d.bought.length || d.unbought.length || d.edited.length)

function names(list) {
  const shown = list.slice(0, MAX_NAMES).join(', ')
  return list.length > MAX_NAMES ? `${shown} +${list.length - MAX_NAMES} more` : shown
}

/** Human lines for one list's changes. */
export function describeList(d) {
  if (d.deleted) return ['Deleted the list']
  const lines = []
  if (d.created) lines.push(d.added.length ? `Created the list with ${d.added.length} item${d.added.length === 1 ? '' : 's'}` : 'Created the list')
  if (d.renamedFrom) lines.push(`Renamed from “${d.renamedFrom}”`)
  if (d.locked !== undefined) lines.push(d.locked ? '🔒 Locked the list' : 'Unlocked the list')
  if (!d.created && d.added.length) lines.push(`Added ${d.added.length}: ${names(d.added)}`)
  if (d.bought.length) lines.push(`Bought ${d.bought.length}: ${names(d.bought)}`)
  if (d.unbought.length) lines.push(`Not bought after all: ${names(d.unbought)}`)
  if (d.removed.length) lines.push(`Removed ${d.removed.length}: ${names(d.removed)}`)
  if (d.edited.length) lines.push(`Edited: ${names(d.edited)}`)
  return lines
}

export function joinNames(list) {
  if (list.length <= 1) return list[0] ?? 'Someone'
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * One consolidated notification for everything that changed.
 * changes: [{ id, diff }]  actors: display names of everyone who made changes.
 */
export function buildPayload(changes, actors) {
  const real = changes.filter((c) => !isEmpty(c.diff))
  if (!real.length) return null
  const who = joinNames(actors)
  const single = real.length === 1
  const title = single ? `${who} updated ${real[0].diff.name}` : `${who} updated ${real.length} lists`
  const lines = single ? describeList(real[0].diff) : real.flatMap((c) => describeList(c.diff).map((l) => `${c.diff.name}: ${l}`))
  const shown = lines.slice(0, 5)
  if (lines.length > shown.length) shown.push(`…and ${lines.length - shown.length} more`)
  return { title, body: shown.join('\n'), tag: 'lists', url: single && !real[0].diff.deleted ? `#/lists/${real[0].id}` : '#/lists' }
}
