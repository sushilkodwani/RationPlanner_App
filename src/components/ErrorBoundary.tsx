import { Component, type ReactNode } from 'react'
import { reloadToLatest } from '../lib/version'

/** Shows what went wrong (and a way out) instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="px-6 py-14 text-center">
        <div className="text-5xl">😕</div>
        <p className="mt-3 font-semibold">This screen couldn’t load</p>
        <p className="muted mt-1 text-sm">Reloading usually fixes it.</p>
        <p className="muted mx-auto mt-3 max-w-xs break-words text-xs">{this.state.error.message}</p>
        <button className="btn-primary mt-5" onClick={() => void reloadToLatest()}>
          Reload app
        </button>
      </div>
    )
  }
}
