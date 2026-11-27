// GitHub REST "Contents" API client: the private data repo is the database.
export interface RepoConfig {
  owner: string
  repo: string
  token: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The request never reached GitHub (offline, DNS, blocked). */
export class NetworkError extends Error {
  constructor() {
    super('No connection.')
    this.name = 'NetworkError'
  }
}

export type ReadResult =
  | { kind: 'ok'; data: unknown; sha: string; etag?: string }
  | { kind: 'not_modified' }
  | { kind: 'missing' }

export interface DirEntry {
  name: string
  path: string
  sha: string
}

/** Everything the app needs from a repo. Implemented by GitHub and by the dev-only demo repo. */
export interface Backend {
  /** Confirms the key opens the repo and says whether it may write. */
  check(): Promise<{ canPush: boolean }>
  read(path: string, etag?: string): Promise<ReadResult>
  /** The .json files directly inside a folder (empty when the folder doesn't exist). */
  list(dir: string): Promise<DirEntry[]>
  /** Creates or updates a file; `sha` must be the current blob sha when the file exists. Returns the new sha. */
  write(path: string, data: unknown, message: string, sha?: string): Promise<string>
  /** Deletes a file; a file that is already gone is fine. */
  remove(path: string, message: string, sha: string): Promise<void>
}

const API = 'https://api.github.com'

// Plain btoa/atob break on non-ASCII text (₹, emoji): go through UTF-8 bytes.
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64Utf8(b64: string): string {
  const raw = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export function githubBackend(cfg: RepoConfig): Backend {
  const repoUrl = `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`

  async function call(url: string, init: RequestInit = {}, extra: Record<string, string> = {}): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...extra,
        },
      })
    } catch {
      throw new NetworkError()
    }
  }

  async function fail(res: Response): Promise<never> {
    let message = `GitHub error ${res.status}`
    try {
      const body = (await res.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, message)
  }

  return {
    async check() {
      const res = await call(repoUrl)
      if (!res.ok) await fail(res)
      const body = (await res.json()) as { permissions?: { push?: boolean } }
      return { canPush: body.permissions?.push === true }
    },

    async read(path, etag) {
      const url = `${repoUrl}/contents/${encodePath(path)}`
      const res = await call(url, {}, etag ? { 'If-None-Match': etag } : {})
      if (res.status === 304) return { kind: 'not_modified' }
      if (res.status === 404) return { kind: 'missing' }
      if (!res.ok) await fail(res)
      const body = (await res.json()) as { content?: string; sha: string; encoding?: string }
      let text: string
      if (body.content && body.encoding === 'base64') {
        text = fromBase64Utf8(body.content)
      } else {
        const raw = await call(url, {}, { Accept: 'application/vnd.github.raw+json' })
        if (!raw.ok) await fail(raw)
        text = await raw.text()
      }
      return { kind: 'ok', data: JSON.parse(text), sha: body.sha, etag: res.headers.get('etag') ?? undefined }
    },

    async list(dir) {
      const res = await call(`${repoUrl}/contents/${encodePath(dir)}`)
      if (res.status === 404) return []
      if (!res.ok) await fail(res)
      const body = (await res.json()) as { type: string; name: string; path: string; sha: string }[]
      if (!Array.isArray(body)) return []
      return body.filter((f) => f.type === 'file' && f.name.endsWith('.json')).map((f) => ({ name: f.name, path: f.path, sha: f.sha }))
    },

    async write(path, data, message, sha) {
      const res = await call(`${repoUrl}/contents/${encodePath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: toBase64Utf8(JSON.stringify(data, null, 2) + '\n'), ...(sha ? { sha } : {}) }),
      })
      if (!res.ok) await fail(res)
      const body = (await res.json()) as { content: { sha: string } }
      return body.content.sha
    },

    async remove(path, message, sha) {
      const res = await call(`${repoUrl}/contents/${encodePath(path)}`, { method: 'DELETE', body: JSON.stringify({ message, sha }) })
      if (res.status === 404) return
      if (!res.ok) await fail(res)
    },
  }
}

/** Human message for a connection / access-key failure. */
export function describeError(e: unknown): string {
  if (e instanceof NetworkError) return 'No connection. Check your internet and try again.'
  if (e instanceof ApiError) {
    if (e.status === 401) return 'The access key isn’t working. It may be wrong or expired. Ask your admin.'
    if (e.status === 403) return 'The access key isn’t allowed to do this, or too many requests were made. Try again in a while.'
    if (e.status === 404) return 'The access key can’t see the data. The key or the app’s data location is wrong.'
    return `Something went wrong while talking to the data store (error ${e.status}). Try again.`
  }
  return (e as Error)?.message ?? 'Something went wrong.'
}
