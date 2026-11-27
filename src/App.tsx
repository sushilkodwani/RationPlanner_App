import { useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import AnalysisScreen from './screens/AnalysisScreen'
import { go, useRoute } from './lib/router'
import { ConnectScreen } from './screens/ConnectScreen'
import { ListScreen } from './screens/ListScreen'
import { ListsScreen } from './screens/ListsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { UsersScreen } from './screens/UsersScreen'
import { useApp } from './store/AppContext'

const TABS = [
  { id: 'lists', label: 'Lists', icon: '🧺' },
  { id: 'analysis', label: 'Analysis', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function App() {
  const { phase } = useApp()
  const route = useRoute()

  // A notification tap while the app is open asks it to go to a screen.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.data?.type === 'open' && typeof e.data.url === 'string') window.location.hash = e.data.url.replace(/^#?/, '#')
    }
    navigator.serviceWorker?.addEventListener('message', on)
    return () => navigator.serviceWorker?.removeEventListener('message', on)
  }, [])

  if (phase === 'boot') return <div className="flex min-h-screen items-center justify-center text-4xl">🧺</div>
  if (phase === 'out') return <ConnectScreen />

  const tab = TABS.find((t) => t.id === route.parts[0])?.id ?? 'lists'
  const inList = tab === 'lists' && route.parts[1]

  return (
    <div className="mx-auto min-h-screen max-w-2xl">
      <UpdatePrompt />
      {!inList && !(tab === 'settings' && route.parts[1]) && <Header title={TABS.find((t) => t.id === tab)!.label} />}
      <main className="pb-28">
        {tab === 'lists' && (inList ? <ListScreen id={route.parts[1]} cat={route.query.get('cat')} /> : <ListsScreen />)}
        {tab === 'analysis' && (
          <ErrorBoundary key="analysis">
            <AnalysisScreen />
          </ErrorBoundary>
        )}
        {tab === 'settings' && (route.parts[1] === 'users' ? <UsersScreen /> : <SettingsScreen />)}
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${tab === t.id ? 'text-green-700 dark:text-green-400' : 'muted'}`}>
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Header({ title }: { title: string }) {
  const { sync, notice, clearNotice } = useApp()
  const status = sync.error ? { text: sync.error, tone: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100' } : sync.offline ? { text: sync.pending ? `Offline · ${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting` : 'Offline · showing saved data', tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100' } : sync.pending || sync.saving ? { text: 'Saving…', tone: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200' } : null
  return (
    <header className="pt-safe px-4 pb-3 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        {status && <span className={`chip max-w-[60%] truncate ${status.tone}`}>{status.text}</span>}
      </div>
      {notice && (
        <p className="mt-2 flex items-start justify-between gap-2 rounded-xl bg-green-100 px-3 py-2 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-100">
          {notice}
          <button onClick={clearNotice} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
    </header>
  )
}
