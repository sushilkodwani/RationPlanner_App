// Dates are always LOCAL. toISOString() gives the UTC day, which is wrong
// before 05:30 in India, so dates are built from the local parts instead.

const pad = (n: number) => String(n).padStart(2, '0')

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

export const monthKey = (date: string) => date.slice(0, 7)

/** Monday of the week the date falls in. */
export function weekStart(date: string): string {
  const d = parseDate(date)
  const back = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - back)
  return localDate(d)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number)
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1] ?? '?'} ${long ? y : String(y).slice(2)}`
}

export function dayLabel(date: string): string {
  const d = parseDate(date)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function weekLabel(start: string): string {
  return dayLabel(start)
}

export function prevMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

/** The last `n` month keys ending at (and including) `endKey`, oldest first. */
export function lastMonths(endKey: string, n: number): string[] {
  const out = [endKey]
  while (out.length < n) out.unshift(prevMonth(out[0]))
  return out
}

export function defaultListName(d = new Date()): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
