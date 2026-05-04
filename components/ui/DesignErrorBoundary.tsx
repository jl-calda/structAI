'use client'

import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class DesignErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ borderTop: '3px solid var(--color-red)' }}>
          <div className="cb flex flex-col gap-2">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-red)' }}>
              Something went wrong rendering this design.
            </p>
            <pre className="mono text-[11px] overflow-auto max-h-40 p-2 rounded"
                 style={{ background: 'var(--color-bg)', color: 'var(--color-text2)' }}>
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="self-start rounded px-3 py-1.5 text-[11.5px] font-semibold"
              style={{ background: 'var(--color-red)', color: '#fff' }}
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
