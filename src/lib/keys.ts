// The access key is what an admin shares with a person: a 6-character personal code
// followed by the repo's access token (without its common "github_pat_" start).
// The code says WHO is using the key (and so their role); the token opens the data repo.
//
// Honest limit: the roles are enforced by the app, not by GitHub. Whoever holds a key
// holds the repo token. Every change is a git commit, so anything can be seen and undone.

export const TOKEN_PREFIXES = ['github_pat_', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_']
const DEFAULT_PREFIX = 'github_pat_'
export const CODE_LEN = 6
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function newCode(taken: Iterable<string> = []): string {
  const used = new Set(taken)
  for (;;) {
    const bytes = new Uint8Array(CODE_LEN)
    crypto.getRandomValues(bytes)
    const code = [...bytes].map((b) => CODE_ALPHA[b % CODE_ALPHA.length]).join('')
    if (!used.has(code)) return code
  }
}

const hasPrefix = (s: string) => TOKEN_PREFIXES.some((p) => s.startsWith(p))

export interface ParsedKey {
  /** Missing when a bare token was pasted (the admin's very first setup). */
  code?: string
  token: string
}

/** Accepts a personal key (code + token body) or a bare token. Spaces and line breaks are dropped. */
export function parseKey(input: string): ParsedKey | null {
  const key = input.replace(/\s+/g, '')
  if (key.length < 8) return null
  if (hasPrefix(key)) return { token: key }
  const code = key.slice(0, CODE_LEN)
  const rest = key.slice(CODE_LEN)
  if (!/^[A-Z2-9]{6}$/.test(code) || !rest) return null
  return { code, token: hasPrefix(rest) ? rest : DEFAULT_PREFIX + rest }
}

export function makeKey(code: string, token: string): string {
  return code + (token.startsWith(DEFAULT_PREFIX) ? token.slice(DEFAULT_PREFIX.length) : token)
}

export function keyMessage(name: string, key: string, appUrl: string): string {
  return [
    `Hi ${name}, here is your Ration Planner access key:`,
    '',
    key,
    '',
    `Open ${appUrl}, install it on your phone, and paste this key when asked.`,
    'It is personal, please don’t share it.',
  ].join('\n')
}
