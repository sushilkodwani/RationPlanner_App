import { useEffect, type ReactNode } from 'react'

/** Bottom sheet on phones, centred dialog on wider screens. Tap the backdrop to close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // Keep the page behind from scrolling while the form is open.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  // Sits near the TOP on phones so the keyboard never covers the fields, and is capped to the
  // visible height (dvh) so its title and close button never slide off-screen.
  return (
    <div className="top-pad-sm fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-3 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[calc(100dvh-5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-stone-50 p-5 shadow-xl dark:bg-stone-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button aria-label="Close" className="btn-soft !px-3 !py-1.5" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  )
}

export function Empty({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="text-5xl">{icon}</div>
      <p className="mt-3 font-semibold">{title}</p>
      {body && <p className="muted mt-1 text-sm">{body}</p>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-stone-200/70 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === o.id ? 'bg-white shadow-sm dark:bg-stone-600' : 'muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
