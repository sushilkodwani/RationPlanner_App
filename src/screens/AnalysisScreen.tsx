import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, Segmented } from '../components/ui'
import { categorySlices, insights, itemSeries, itemStats, money, monthRows, purchasesOf, spendOf } from '../lib/analysis'
import { daysBetween, localDate, monthKey, monthLabel, prevMonth } from '../lib/dates'
import { useApp } from '../store/AppContext'
import { useTheme } from '../store/ThemeContext'

// Categorical hues come from CSS variables (validated light/dark steps), assigned to a
// category by its position in Settings so a category keeps its colour on every chart.
const hue = (i: number) => `var(--c${(i % 8) + 1})`

export default function AnalysisScreen() {
  // Hooks first, then the empty state: keeps the hook order the same on every render.
  const { lists, config } = useApp()
  const { isDark } = useTheme()
  const today = localDate()
  const ps = useMemo(() => purchasesOf(lists), [lists])
  const stats = useMemo(() => itemStats(ps), [ps])
  const [months, setMonths] = useState<'6' | '12'>('6')
  const [range, setRange] = useState<'month' | 'all'>('month')
  const [itemKey, setItemKey] = useState('')
  const [by, setBy] = useState<'week' | 'month'>('week')

  const axis = isDark ? '#a8a29e' : '#57534e'
  const grid = isDark ? '#292524' : '#e7e5e4'
  const tip = { background: isDark ? '#1c1917' : '#fff', border: `1px solid ${grid}`, borderRadius: 12, color: isDark ? '#f5f5f4' : '#1c1917', fontSize: 13 }
  const catIndex = (id: string) => Math.max(0, config.categories.findIndex((c) => c.id === id))
  const catName = (id: string) => config.categories.find((c) => c.id === id)?.name ?? id

  if (!ps.length)
    return <Empty icon="📊" title="Nothing to analyse yet" body="Charts appear once items are marked as bought. Add prices to see costs." />

  const thisM = monthKey(today)
  const rows = monthRows(ps, thisM, Number(months))
  const spendThis = spendOf(ps.filter((p) => monthKey(p.date) === thisM))
  const spendPrev = spendOf(ps.filter((p) => monthKey(p.date) === prevMonth(thisM)))
  const boughtThis = ps.filter((p) => monthKey(p.date) === thisM).length
  const ideas = insights(lists, ps, config.categories, today)

  const slices = categorySlices(range === 'month' ? ps.filter((p) => monthKey(p.date) === thisM) : ps, config.categories)
  const usedCats = [...new Set(ps.map((p) => p.category))]

  const chosen = stats.find((s) => s.key === itemKey) ?? stats[0]
  const series = itemSeries(ps, chosen.key, by, today, by === 'week' ? 12 : 12)
  const anyPrice = series.some((s) => s.avgPrice !== undefined)

  return (
    <div className="space-y-4 px-4 pb-8">
      <div className="grid grid-cols-3 gap-2">
        <Tile label={monthLabel(thisM)} value={money(spendThis)} sub="spent this month" />
        <Tile label="Bought" value={String(boughtThis)} sub="items this month" />
        <Tile label={monthLabel(prevMonth(thisM))} value={money(spendPrev)} sub="spent last month" />
      </div>

      {ideas.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Ideas from your data</h2>
          <ul className="space-y-2.5">
            {ideas.map((i, n) => (
              <li key={n} className="flex gap-3 text-sm">
                <span className="text-lg leading-5">{i.icon}</span>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <Head title="Spend by month" right={<Segmented value={months} onChange={setMonths} options={[{ id: '6', label: '6 mo' }, { id: '12', label: '12 mo' }]} />} />
        <div className="h-52">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" stroke={axis} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis stroke={axis} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
              <Tooltip contentStyle={tip} cursor={{ fill: grid, opacity: 0.5 }} formatter={(v: number) => [money(v), 'Spent']} />
              <Bar dataKey="spend" name="Spent" fill="var(--c1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="muted mt-1 text-xs">Only items with a price are counted.</p>
      </section>

      <section className="card">
        <Head title="Items bought per month" />
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={rows.map((r) => ({ label: r.label, ...r.byCategory }))} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" stroke={axis} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis stroke={axis} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tip} cursor={{ fill: grid, opacity: 0.5 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: axis }} iconType="circle" formatter={(v) => <span style={{ color: axis }}>{catName(String(v))}</span>} />
              {usedCats.map((c) => (
                <Bar key={c} dataKey={c} name={catName(c)} stackId="a" fill={hue(catIndex(c))} stroke={isDark ? '#1c1917' : '#fff'} strokeWidth={2} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card">
        <Head title="Spend by category" right={<Segmented value={range} onChange={setRange} options={[{ id: 'month', label: 'This month' }, { id: 'all', label: 'All time' }]} />} />
        {slices.length === 0 || slices.every((s) => s.spend === 0) ? (
          <p className="muted py-6 text-center text-sm">No priced purchases in this range.</p>
        ) : (
          <div style={{ height: 56 + slices.length * 44 }}>
            <ResponsiveContainer>
              <BarChart data={slices} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={84} stroke={axis} tick={{ fill: axis, fontSize: 13 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: grid, opacity: 0.5 }} formatter={(v: number) => [money(v), 'Spent']} />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]} barSize={22} label={{ position: 'right', fill: axis, fontSize: 12, formatter: (v: number) => money(v) }}>
                  {slices.map((s) => (
                    <Cell key={s.id} fill={hue(catIndex(s.id))} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card">
        <Head title="One item, over time" />
        <select className="input mb-3" value={chosen.key} onChange={(e) => setItemKey(e.target.value)}>
          {stats.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name} ({s.times}×)
            </option>
          ))}
        </select>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Mini label="Times bought" value={String(chosen.times)} />
          <Mini label="Usually every" value={chosen.gapDays ? `${Math.round(chosen.gapDays)} d` : '–'} />
          <Mini label="Last bought" value={`${daysBetween(chosen.lastDate, today)} d ago`} />
          <Mini label="Avg price" value={chosen.avgPrice ? money(chosen.avgPrice) : '–'} />
          <Mini label="Cheapest" value={chosen.minPrice ? money(chosen.minPrice) : '–'} />
          <Mini label="Dearest" value={chosen.maxPrice ? money(chosen.maxPrice) : '–'} />
        </div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Times bought</span>
          <Segmented value={by} onChange={setBy} options={[{ id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' }]} />
        </div>
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" stroke={axis} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis stroke={axis} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tip} cursor={{ fill: grid, opacity: 0.5 }} formatter={(v: number) => [v, 'Bought']} />
              <Bar dataKey="count" fill={hue(catIndex(chosen.category))} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {anyPrice && (
          <>
            <p className="mb-1 mt-3 text-sm font-medium">Price paid</p>
            <div className="h-36">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="label" stroke={axis} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke={axis} tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={tip} formatter={(v: number) => [money(v), 'Avg price']} />
                  <Line type="monotone" dataKey="avgPrice" stroke={hue(catIndex(chosen.category))} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: isDark ? '#1c1917' : '#fff' }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <Head title="Most bought items" />
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {stats.slice(0, 8).map((s) => (
            <li key={s.key} className="flex items-center justify-between py-2 text-sm">
              <button className="min-w-0 truncate text-left font-medium" onClick={() => setItemKey(s.key)}>
                {s.name}
              </button>
              <span className="muted shrink-0 pl-3">
                {s.times}×{s.spend ? ` · ${money(s.spend)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{title}</h2>
      {right}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card !p-3">
      <div className="muted text-xs">{label}</div>
      <div className="mt-1 text-lg font-bold leading-tight">{value}</div>
      <div className="muted text-xs">{sub}</div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-100 p-2 dark:bg-stone-800">
      <div className="muted text-[11px]">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  )
}
