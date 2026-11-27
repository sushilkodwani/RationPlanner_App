// Dev-server-only fake repo kept in this browser's localStorage, so every flow can be
// tried without GitHub. Used when VITE_DATA_OWNER is "demo". Never reachable in production.
import { ApiError, type Backend } from './github'

interface Entry {
  data: unknown
  sha: string
}

export function demoBackend(repo: string): Backend {
  const KEY = `rp.demo.${repo}`
  const load = (): Record<string, Entry> => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}')
    } catch {
      return {}
    }
  }
  const save = (db: Record<string, Entry>) => localStorage.setItem(KEY, JSON.stringify(db))
  const newSha = () => Math.random().toString(16).slice(2) + Date.now().toString(16)

  return {
    async check() {
      return { canPush: true }
    },
    async read(path) {
      const e = load()[path]
      return e ? { kind: 'ok', data: JSON.parse(JSON.stringify(e.data)), sha: e.sha } : { kind: 'missing' }
    },
    async list(dir) {
      return Object.entries(load())
        .filter(([p]) => p.startsWith(`${dir}/`) && p.endsWith('.json'))
        .map(([path, e]) => ({ name: path.slice(dir.length + 1), path, sha: e.sha }))
    },
    async write(path, data, _message, sha) {
      const db = load()
      const cur = db[path]
      if (cur && cur.sha !== sha) throw new ApiError(409, `${path} does not match`)
      if (!cur && sha) throw new ApiError(422, 'sha supplied for a missing file')
      const next = newSha()
      db[path] = { data: JSON.parse(JSON.stringify(data)), sha: next }
      save(db)
      return next
    },
    async remove(path, _message, sha) {
      const db = load()
      if (!db[path]) return
      if (db[path].sha !== sha) throw new ApiError(409, `${path} does not match`)
      delete db[path]
      save(db)
    },
  }
}
