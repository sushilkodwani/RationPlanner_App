import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_CATEGORIES, type Category, type ConfigFile, type Role, type ShopList, type User, type UsersFile } from '../types'
import { demoBackend } from '../lib/demoBackend'
import { ApiError, NetworkError, describeError, githubBackend, type Backend } from '../lib/github'
import { makeKey, newCode, parseKey } from '../lib/keys'
import { applyOps, summarize, type Op } from '../lib/ops'
import { P, listPath } from '../lib/paths'
import { DATA_OWNER, DATA_REPO, DEMO, clearSession, loadSession, saveSession, type Session } from '../lib/session'
import { shortId } from '../lib/uuid'

type Phase = 'boot' | 'out' | 'in'

/** Distributes Omit over the Op union so each variant keeps its own fields. */
type Distribute<T> = T extends unknown ? Omit<T, 'opId' | 'actor' | 'at' | 'listId'> & { listId?: string } : never
export type NewOp = Distribute<Op>

export interface Sync {
  pending: number
  saving: boolean
  offline: boolean
  error: string | null
}

interface Ctx {
  phase: Phase
  user: User | null
  role: Role
  can: { edit: boolean; lock: boolean; admin: boolean }
  config: ConfigFile
  /** Categories that are not archived: the tabs. */
  tabs: Category[]
  users: User[]
  lists: ShopList[]
  token: string
  loaded: boolean
  sync: Sync
  notice: string | null
  clearNotice(): void
  backend: Backend | null
  connect(input: string): Promise<{ status: 'ok' } | { status: 'setup' }>
  setup(name: string): Promise<string>
  replaceKey(input: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>
  dispatch(listId: string, op: NewOp): void
  updateCategories(fn: (c: Category[]) => Category[]): Promise<void>
  updateUsers(fn: (u: User[]) => User[]): Promise<void>
  flush(): Promise<boolean>
  keyFor(u: User): string
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

const EMPTY_CONFIG: ConfigFile = { schema: 1, categories: DEFAULT_CATEGORIES }
const FLUSH_DELAY_MS = 1500
const repoKey = `${DATA_OWNER}/${DATA_REPO}`.toLowerCase()
const QUEUE_KEY = `rp.queue.${repoKey}`
const CACHE_KEY = `rp.cache.${repoKey}`

interface Cache {
  config: ConfigFile | null
  users: User[]
  lists: Record<string, { list: ShopList; sha: string }>
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: the app still works from memory
  }
}

function makeBackend(token: string): Backend {
  if (DEMO) return demoBackend(DATA_REPO.toLowerCase())
  return githubBackend({ owner: DATA_OWNER, repo: DATA_REPO, token })
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('boot')
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [config, setConfig] = useState<ConfigFile>(EMPTY_CONFIG)
  const [users, setUsers] = useState<User[]>([])
  const [base, setBase] = useState<Record<string, { list: ShopList; sha: string }>>({})
  const [queue, setQueue] = useState<Op[]>(() => readLocal<Op[]>(QUEUE_KEY, []))
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const backend = useMemo(() => (session ? makeBackend(session.token) : null), [session])
  const user = useMemo(() => users.find((u) => u.code === session?.code) ?? null, [users, session])

  // Refs so async code always sees the newest values.
  const baseRef = useRef(base)
  const queueRef = useRef(queue)
  const backendRef = useRef(backend)
  const userRef = useRef(user)
  baseRef.current = base
  queueRef.current = queue
  backendRef.current = backend
  userRef.current = user
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** Refresh and flush never run at the same time. */
  const serial = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(fn, fn)
    chain.current = next.catch(() => undefined)
    return next
  }, [])

  const setQueueBoth = useCallback((next: Op[]) => {
    queueRef.current = next
    setQueue(next)
    writeLocal(QUEUE_KEY, next)
  }, [])

  /** Saves the phone's copy. Pass only what changed; the rest is kept. */
  const persistCache = useCallback((part: Partial<Cache>) => {
    const cur = readLocal<Cache>(CACHE_KEY, { config: null, users: [], lists: {} })
    writeLocal(CACHE_KEY, { ...cur, ...part } satisfies Cache)
  }, [])

  const failWith = useCallback((e: unknown) => {
    if (e instanceof NetworkError) {
      setOffline(true)
      return
    }
    setError(describeError(e))
  }, [])

  const leave = useCallback((message?: string) => {
    clearSession()
    setQueueBoth([])
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // ignore
    }
    setSession(null)
    setUsers([])
    setBase({})
    setLoaded(false)
    setPhase('out')
    if (message) setNotice(message)
  }, [setQueueBoth])

  // ---------- reading ----------
  const refresh = useCallback(
    () =>
      serial(async () => {
        const be = backendRef.current
        if (!be) return
        try {
          const [cfg, usr, dir] = await Promise.all([be.read(P.config), be.read(P.users), be.list(P.listsDir)])
          setOffline(false)
          setError(null)
          if (usr.kind !== 'ok') {
            leave('This app has not been set up yet, or its data was reset. Ask your admin.')
            return
          }
          const nextUsers = (usr.data as UsersFile).users ?? []
          const me = nextUsers.find((u) => u.code === loadSession()?.code)
          if (!me) {
            leave('Your access was removed. Ask your admin for a new key.')
            return
          }
          const nextCfg = cfg.kind === 'ok' ? (cfg.data as ConfigFile) : EMPTY_CONFIG
          const next: Record<string, { list: ShopList; sha: string }> = {}
          const wanted = dir.map((d) => ({ id: d.name.replace(/\.json$/, ''), path: d.path, sha: d.sha }))
          await Promise.all(
            wanted.map(async (w) => {
              const have = baseRef.current[w.id]
              if (have && have.sha === w.sha) {
                next[w.id] = have
                return
              }
              const r = await be.read(w.path)
              if (r.kind === 'ok') next[w.id] = { list: r.data as ShopList, sha: r.sha }
            }),
          )
          setConfig(nextCfg)
          setUsers(nextUsers)
          setBase(next)
          baseRef.current = next
          setLoaded(true)
          persistCache({ config: nextCfg, users: nextUsers, lists: next })
        } catch (e) {
          failWith(e)
          setLoaded(true) // show whatever is cached
        }
      }),
    [serial, leave, persistCache, failWith],
  )

  // ---------- writing lists ----------
  const flushNow = useCallback(
    () =>
      serial(async () => {
        const be = backendRef.current
        if (!be || !queueRef.current.length) return true
        setSaving(true)
        let ok = true
        try {
          const groups = new Map<string, Op[]>()
          for (const op of queueRef.current) groups.set(op.listId, [...(groups.get(op.listId) ?? []), op])
          for (const [listId, ops] of groups) {
            const path = listPath(listId)
            let done = false
            for (let attempt = 0; attempt < 4 && !done; attempt++) {
              let cur = attempt === 0 ? baseRef.current[listId] : undefined
              if (!cur && (attempt > 0 || ops[0].t !== 'create')) {
                const r = await be.read(path)
                cur = r.kind === 'ok' ? { list: r.data as ShopList, sha: r.sha } : undefined
              }
              const before = cur?.list ?? null
              const after = applyOps(before, ops)
              const drop = () => setQueueBoth(queueRef.current.filter((o) => !ops.some((x) => x.opId === o.opId)))
              if (JSON.stringify(before) === JSON.stringify(after)) {
                drop()
                done = true
                break
              }
              const message = `${summarize(ops, (after ?? before)?.name ?? 'list')}\n\nActor: ${ops[ops.length - 1].actor}`
              try {
                const nextBase = { ...baseRef.current }
                if (after === null) {
                  await be.remove(path, message, cur!.sha)
                  delete nextBase[listId]
                } else {
                  const sha = await be.write(path, after, message, cur?.sha)
                  nextBase[listId] = { list: after, sha }
                }
                baseRef.current = nextBase
                setBase(nextBase)
                persistCache({ lists: nextBase })
                drop()
                done = true
              } catch (e) {
                if (e instanceof ApiError && (e.status === 409 || e.status === 422)) {
                  // Someone saved first. Forget what we knew and replay on the newest copy.
                  const nb = { ...baseRef.current }
                  delete nb[listId]
                  baseRef.current = nb
                  continue
                }
                throw e
              }
            }
            if (!done) throw new ApiError(409, 'Could not save after several tries.')
          }
          setOffline(false)
          setError(null)
        } catch (e) {
          ok = false
          failWith(e)
        } finally {
          setSaving(false)
        }
        return ok
      }),
    [serial, setQueueBoth, persistCache, failWith],
  )

  const scheduleFlush = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flushNow(), FLUSH_DELAY_MS)
  }, [flushNow])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    return flushNow()
  }, [flushNow])

  // ---------- permissions ----------
  const role: Role = user?.role ?? 'viewer'
  const can = useMemo(() => ({ edit: role !== 'viewer', lock: role === 'admin' || role === 'locker', admin: role === 'admin' }), [role])

  const dispatch = useCallback(
    (listId: string, op: NewOp) => {
      const me = userRef.current
      if (!me) return
      const mayEdit = me.role !== 'viewer'
      const mayLock = me.role === 'admin' || me.role === 'locker'
      const allowed = op.t === 'lock' || op.t === 'delete' ? mayLock : mayEdit
      if (!allowed) return
      const full = { ...op, listId, opId: shortId(), actor: me.id, at: new Date().toISOString() } as Op
      setQueueBoth([...queueRef.current, full])
      scheduleFlush()
    },
    [setQueueBoth, scheduleFlush],
  )

  // The lists on screen = what is in the repo + whatever has not been sent yet.
  const lists = useMemo(() => {
    const ids = new Set([...Object.keys(base), ...queue.map((o) => o.listId)])
    const out: ShopList[] = []
    for (const id of ids) {
      const l = applyOps(base[id]?.list ?? null, queue.filter((o) => o.listId === id))
      if (l) out.push(l)
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [base, queue])

  // ---------- admin files (config, users) ----------
  const mutateFile = useCallback(async <T,>(path: string, fallback: T, fn: (cur: T) => T, message: string): Promise<T> => {
    const be = backendRef.current
    if (!be) throw new Error('Not connected.')
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await be.read(path)
      const cur = r.kind === 'ok' ? (r.data as T) : fallback
      const next = fn(cur)
      try {
        await be.write(path, next, `${message}\n\nActor: ${userRef.current?.id ?? ''}`, r.kind === 'ok' ? r.sha : undefined)
        return next
      } catch (e) {
        if (e instanceof ApiError && (e.status === 409 || e.status === 422)) continue
        throw e
      }
    }
    throw new ApiError(409, 'Could not save after several tries.')
  }, [])

  const updateCategories = useCallback(
    async (fn: (c: Category[]) => Category[]) => {
      const next = await mutateFile<ConfigFile>(P.config, EMPTY_CONFIG, (cur) => ({ ...cur, schema: 1, categories: fn(cur.categories ?? DEFAULT_CATEGORIES) }), 'Update categories')
      setConfig(next)
    },
    [mutateFile],
  )

  const updateUsers = useCallback(
    async (fn: (u: User[]) => User[]) => {
      const next = await mutateFile<UsersFile>(P.users, { schema: 1, users: [] }, (cur) => ({ schema: 1, users: fn(cur.users) }), 'Update users')
      setUsers(next.users)
    },
    [mutateFile],
  )

  // ---------- signing in ----------
  const connect = useCallback<Ctx['connect']>(async (input) => {
    const parsed = parseKey(input)
    if (!parsed) throw new Error('That doesn’t look like an access key. Paste the whole key your admin sent.')
    const be = makeBackend(parsed.token)
    await be.check()
    const r = await be.read(P.users)
    if (r.kind !== 'ok') {
      if (parsed.code) throw new Error('The app has not been set up yet. The admin has to do the first-time setup first.')
      setSession({ token: parsed.token })
      return { status: 'setup' }
    }
    if (!parsed.code) throw new Error('That is the shared repo key. Use the personal key your admin made for you.')
    const me = (r.data as UsersFile).users.find((u) => u.code === parsed.code)
    if (!me) throw new Error('This key isn’t recognised. Ask your admin for a new one.')
    const s: Session = { token: parsed.token, code: me.code }
    saveSession(s)
    setSession(s)
    setPhase('in')
    return { status: 'ok' }
  }, [])

  const setup = useCallback(
    async (name: string) => {
      const token = session?.token
      if (!token) throw new Error('Start again and paste the key.')
      const be = makeBackend(token)
      const { canPush } = await be.check()
      if (!canPush) throw new Error('This key can only read. For setup it needs “Contents: Read and write”.')
      const me: User = { id: shortId(), code: newCode(), name: name.trim(), role: 'admin', createdAt: new Date().toISOString() }
      const existing = await be.read(P.users)
      if (existing.kind === 'ok') throw new Error('Someone already set this app up. Ask them for your key.')
      await be.write(P.config, EMPTY_CONFIG, `Set up\n\nActor: ${me.id}`)
      await be.write(P.users, { schema: 1, users: [me] } satisfies UsersFile, `Add admin ${me.name}\n\nActor: ${me.id}`)
      const s: Session = { token, code: me.code }
      saveSession(s)
      setSession(s)
      setPhase('in')
      return makeKey(me.code, token)
    },
    [session],
  )

  const replaceKey = useCallback(
    async (input: string) => {
      const parsed = parseKey(input)
      if (!parsed) throw new Error('That doesn’t look like an access key.')
      if (parsed.code && parsed.code !== session?.code) throw new Error('That key belongs to someone else. Use your own key.')
      const be = makeBackend(parsed.token)
      await be.check()
      const r = await be.read(P.users)
      if (r.kind !== 'ok' || !(r.data as UsersFile).users.some((u) => u.code === session?.code)) throw new Error('This key doesn’t open your account.')
      const s: Session = { token: parsed.token, code: session?.code }
      saveSession(s)
      setSession(s)
      setError(null)
      setOffline(false)
    },
    [session],
  )

  const logout = useCallback(async () => {
    await flush().catch(() => false)
    leave()
  }, [flush, leave])

  const keyFor = useCallback((u: User) => makeKey(u.code, session?.token ?? ''), [session])

  // ---------- lifecycle ----------
  useEffect(() => {
    if (!session) {
      setPhase('out')
      return
    }
    if (phase === 'boot') {
      const cache = readLocal<Cache | null>(CACHE_KEY, null)
      if (cache?.users?.some((u) => u.code === session.code)) {
        if (cache.config) setConfig(cache.config)
        setUsers(cache.users)
        setBase(cache.lists ?? {})
        baseRef.current = cache.lists ?? {}
        setLoaded(true)
      }
      setPhase(session.code ? 'in' : 'out')
    }
  }, [session, phase])

  useEffect(() => {
    if (phase !== 'in') return
    void refresh().then(() => flushNow())
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().then(() => flushNow())
    }
    const onOnline = () => void refresh().then(() => flushNow())
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [phase, refresh, flushNow, session?.token])

  const value: Ctx = {
    phase,
    user,
    role,
    can,
    config,
    tabs: config.categories.filter((c) => !c.archived),
    users,
    lists,
    token: session?.token ?? '',
    loaded,
    sync: { pending: queue.length, saving, offline, error },
    notice,
    clearNotice: () => setNotice(null),
    backend,
    connect,
    setup,
    replaceKey,
    logout,
    refresh,
    dispatch,
    updateCategories,
    updateUsers,
    flush,
    keyFor,
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
