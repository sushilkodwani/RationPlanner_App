// A tiny hash router: every screen has a URL, so the Android back button, reloads and
// notification taps all land where they should.
import { useEffect, useState } from 'react'

function read() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) }
}

export function useRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string, replace = false) {
  const url = `#/${path.replace(/^#?\/?/, '')}`
  if (replace) window.location.replace(url)
  else window.location.hash = url
}

export const back = () => window.history.back()
