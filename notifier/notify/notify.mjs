// Ration Planner change notifier. Runs in the PRIVATE DATA repo via .github/workflows/notify.yml.
//
// 1. The workflow waits 2 minutes. A newer edit cancels it and starts its own 2-minute wait,
//    so the run that survives starts 2 minutes after the LAST edit.
// 2. It finds every list change since the last run (marker in push/state.json), nets them out
//    (add-then-remove = nothing) and writes ONE summary.
// 3. It sends it to everyone who turned notifications on, except the person who made the
//    changes when it was only one person.
//
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… or https://…)
// Optional: TEST_MESSAGE (manual test run), DRY_RUN=1 (print instead of sending), BEFORE_SHA.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildPayload, diffList } from './diff.mjs'

const DRY_RUN = process.env.DRY_RUN === '1'
const SUBS_PATH = 'push/subscriptions.json'
const STATE_PATH = 'push/state.json'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
const tryGit = (...args) => {
  try {
    return git(...args)
  } catch {
    return null
  }
}
const jsonAt = (rev, path) => {
  const text = tryGit('show', `${rev}:${path}`)
  if (text == null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}
const writeJson = (path, data) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

async function loadWebPush() {
  if (DRY_RUN) return null
  const { default: webpush } = await import('web-push')
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error('Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT secrets.')
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  return webpush
}

async function send(recipients, payload, webpush) {
  const dead = new Set()
  for (const sub of recipients) {
    const label = `${sub.userId} (${sub.device})`
    if (DRY_RUN) {
      console.log(`[dry-run] → ${label}\n${JSON.stringify(payload, null, 2)}`)
      continue
    }
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
        TTL: 60 * 60 * 24,
        urgency: 'normal',
        ...(payload.tag ? { topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
      })
      console.log(`sent → ${label}`)
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        console.log(`expired → ${label}, removing`)
        dead.add(sub.endpoint)
      } else console.error(`failed → ${label}: ${e.statusCode ?? ''} ${e.body ?? e.message}`)
    }
  }
  return dead
}

function commitState(head, dead) {
  if (DRY_RUN) {
    console.log(`[dry-run] would set marker to ${head}, remove ${dead.size} subscription(s)`)
    return
  }
  git('config', 'user.name', 'github-actions[bot]')
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
  for (let attempt = 0; attempt < 3; attempt++) {
    const subs = readJson(SUBS_PATH, { schema: 1, subscriptions: [] })
    if (dead.size) writeJson(SUBS_PATH, { ...subs, subscriptions: subs.subscriptions.filter((s) => !dead.has(s.endpoint)) })
    writeJson(STATE_PATH, { lastNotifiedSha: head, updatedAt: new Date().toISOString() })
    git('add', STATE_PATH, ...(existsSync(SUBS_PATH) ? [SUBS_PATH] : []))
    if (tryGit('diff', '--cached', '--quiet') !== null) return // nothing staged
    git('commit', '-m', 'Notifier state [skip ci]')
    if (tryGit('push') !== null) return
    git('reset', '--hard', 'HEAD~1')
    git('pull', '--rebase')
  }
  console.error('Could not record notifier state; the next run may repeat these notifications.')
}

async function main() {
  const subscriptions = readJson(SUBS_PATH, { subscriptions: [] }).subscriptions ?? []
  const webpush = await loadWebPush()
  const head = git('rev-parse', 'HEAD')

  if (process.env.TEST_MESSAGE) {
    const dead = await send(subscriptions, { title: 'Ration Planner', body: process.env.TEST_MESSAGE, tag: 'test', url: '' }, webpush)
    if (dead.size) commitState(head, dead)
    return
  }

  const marker = readJson(STATE_PATH, {}).lastNotifiedSha
  const fallback = process.env.BEFORE_SHA && !/^0+$/.test(process.env.BEFORE_SHA) ? process.env.BEFORE_SHA : null
  const start = [marker, fallback].find((sha) => sha && tryGit('cat-file', '-e', `${sha}^{commit}`) !== null) ?? tryGit('rev-parse', `${head}^`)
  if (!start) {
    commitState(head, new Set())
    return
  }

  const files = git('diff', '--name-only', start, head, '--', 'lists')
    .split('\n')
    .filter((f) => /^lists\/[^/]+\.json$/.test(f))
  const users = readJson('users.json', { users: [] }).users ?? []
  const nameOf = (id) => users.find((u) => u.id === id)?.name

  const changes = []
  const actorIds = new Set()
  for (const file of files) {
    const diff = diffList(jsonAt(start, file), jsonAt(head, file))
    changes.push({ id: file.slice('lists/'.length, -'.json'.length), diff })
    for (const sha of git('log', '--format=%H', `${start}..${head}`, '--', file).split('\n').filter(Boolean)) {
      const id = git('show', '-s', '--format=%B', sha).match(/^Actor:\s*(\S+)/m)?.[1]
      if (id) actorIds.add(id)
    }
  }
  console.log(`range ${start}..${head}: ${files.length} list file(s), actors: ${[...actorIds].join(', ') || 'unknown'}`)

  const actors = [...actorIds].map((id) => nameOf(id) ?? 'Someone')
  const payload = buildPayload(changes, actors.length ? actors : ['Someone'])
  const dead = new Set()
  if (payload) {
    // One person made all the changes: they don't need telling. Otherwise tell everyone.
    const only = actorIds.size === 1 ? [...actorIds][0] : null
    const recipients = subscriptions.filter((s) => s.userId !== only)
    console.log(`"${payload.title}" → ${recipients.length} device(s)`)
    for (const e of await send(recipients, payload, webpush)) dead.add(e)
  } else console.log('No net change worth a notification.')
  commitState(head, dead)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
