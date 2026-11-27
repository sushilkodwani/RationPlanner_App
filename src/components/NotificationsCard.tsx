import { useEffect, useState } from 'react'
import { describeError } from '../lib/github'
import { disablePush, enablePush, ensureSubscriptionSaved, isPushEnabled, pushSupport } from '../lib/push'
import { useApp } from '../store/AppContext'

const WHY: Record<string, string> = {
  dev: 'Notifications only work in the installed app, not while developing.',
  'not-configured': 'Notifications are not set up for this app yet. The admin needs to add the notification key.',
  'needs-install': 'On iPhone, add the app to your Home Screen first, then open it from there.',
  unsupported: 'This browser can’t show notifications.',
}

export function NotificationsCard() {
  const { backend, user } = useApp()
  const support = pushSupport()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!backend || !user) return
    void ensureSubscriptionSaved(backend, user.id)
    void isPushEnabled().then(setOn)
  }, [backend, user])

  async function toggle() {
    if (!backend || !user) return
    setBusy(true)
    setMsg(null)
    try {
      if (on) {
        await disablePush(backend, user.id)
        setOn(false)
      } else {
        const p = await enablePush(backend, user.id)
        if (p === 'granted') setOn(true)
        else setMsg('Notifications are blocked. Allow them in your phone’s settings for this app.')
      }
    } catch (e) {
      setMsg(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Notifications</div>
          <div className="muted text-sm">{support === 'ok' ? 'Get one summary 2 minutes after the last change to a list.' : WHY[support]}</div>
        </div>
        {support === 'ok' && (
          <button className={on ? 'btn-soft' : 'btn-primary'} disabled={busy} onClick={toggle}>
            {on ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </div>
  )
}
