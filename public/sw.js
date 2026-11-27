// Service worker: app-shell caching and push notifications.
// - Page loads: NETWORK FIRST (a new deploy shows on next launch; cached copy only when offline/slow).
// - /assets/* have hashed names: CACHE FIRST.
// - Other same-origin files: stale-while-revalidate.
// - sw.js and version.json are never cached. Cross-origin (api.github.com) is never touched.
// Bump VERSION to drop every installed copy's old caches.
const VERSION = 'v1'
const SHELL_CACHE = `rp-shell-${VERSION}`
const ASSET_CACHE = `rp-assets-${VERSION}`
const NAV_TIMEOUT_MS = 4000

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE])
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE)
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone())
    return res
  })
  network.catch(() => {})
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS))
  try {
    const res = await Promise.race([network, timeout])
    if (res) return res
  } catch {
    // offline: fall through to the cache
  }
  const cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./', { ignoreSearch: true }))
  return cached || network
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => cached)
  return cached || network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/version.json')) return
  if (request.mode === 'navigate') event.respondWith(networkFirstPage(request))
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirstAsset(request))
  else event.respondWith(staleWhileRevalidate(request))
})

// Payload from the notifier Action: { title, body, tag?, url? }  url = in-app route like "#/lists/abc"
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ration Planner', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './badge-72.png',
      tag: data.tag || undefined,
      data: { url: data.url || '' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = (event.notification.data && event.notification.data.url) || ''
  const target = new URL(`./${route}`, self.registration.scope).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (existing) {
        existing.postMessage({ type: 'open', url: route })
        return existing.focus()
      }
      return self.clients.openWindow(target)
    })(),
  )
})
