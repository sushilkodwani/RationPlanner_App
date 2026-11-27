// Web Push subscription. The app only RECEIVES pushes. Sending happens in a GitHub Action
// in the data repo (see notifier/), which reads the subscriptions saved here.
import type { PushSub, SubsFile } from '../types'
import { ApiError, type Backend } from './github'
import { P } from './paths'
import { getPref, setPref } from './session'
import { uuid } from './uuid'

const VAPID_PUBLIC_KEY = ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '').trim()

export type PushSupport = 'ok' | 'not-configured' | 'dev' | 'needs-install' | 'unsupported'

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export function pushSupport(): PushSupport {
  if (!import.meta.env.PROD) return 'dev'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac/.test(ua)) return 'Mac'
  return 'Browser'
}

export function deviceId(): string {
  let id = getPref<string>('deviceId', '')
  if (!id) {
    id = uuid()
    setPref('deviceId', id)
  }
  return id
}

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Read-modify-write with a retry, because two phones may save at the same moment. */
async function updateSubs(be: Backend, userId: string, message: string, change: (s: PushSub[]) => PushSub[]): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await be.read(P.subs)
    const cur = r.kind === 'ok' ? ((r.data as SubsFile).subscriptions ?? []) : []
    try {
      await be.write(P.subs, { schema: 1, subscriptions: change(cur) } satisfies SubsFile, `${message}\n\nActor: ${userId}`, r.kind === 'ok' ? r.sha : undefined)
      return
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 422)) continue
      throw e
    }
  }
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function isPushEnabled(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false
  return !!(await subscription())
}

async function save(be: Backend, userId: string, sub: PushSubscription): Promise<void> {
  const j = sub.toJSON()
  const rec: PushSub = {
    userId,
    deviceId: deviceId(),
    device: deviceLabel(),
    endpoint: sub.endpoint,
    keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' },
    createdAt: new Date().toISOString(),
  }
  await updateSubs(be, userId, `Turn on notifications (${rec.device})`, (s) => [...s.filter((x) => x.deviceId !== rec.deviceId), rec])
  setPref('pushSaved', sub.endpoint)
}

async function subscribe(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
}

/** Call straight from a tap: browsers only show the permission prompt for a user gesture. */
export async function enablePush(be: Backend, userId: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  setPref('pushOff', false)
  await save(be, userId, await subscribe())
  return 'granted'
}

export async function disablePush(be: Backend, userId: string): Promise<void> {
  setPref('pushOff', true)
  const id = deviceId()
  await updateSubs(be, userId, 'Turn off notifications', (s) => s.filter((x) => x.deviceId !== id))
  setPref('pushSaved', '')
  await (await subscription())?.unsubscribe().catch(() => {})
}

/** On launch: if allowed, make sure this phone's saved entry is current (browsers can rotate the endpoint). */
export async function ensureSubscriptionSaved(be: Backend, userId: string): Promise<void> {
  try {
    if (pushSupport() !== 'ok' || Notification.permission !== 'granted' || getPref('pushOff', false)) return
    const sub = await subscribe()
    if (getPref('pushSaved', '') === sub.endpoint) return
    await save(be, userId, sub)
  } catch {
    // best effort, retried next launch
  }
}
