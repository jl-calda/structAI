'use client'

import { useMemo, useState } from 'react'

import { Icon } from '@/components/ui/Icon'

type MemberLite = {
  id: string
  member_id: number
  member_type: 'beam' | 'column' | 'brace' | 'other'
  section_name: string
  length_mm: number
  status?: 'pass' | 'fail' | 'warn' | 'pending'
  metric?: number | null
  metric_label?: 'Mu' | 'Ratio' | null
}

type Filter = 'all' | 'beam' | 'column'

export function MembersTable({ members }: { members: MemberLite[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(
    () => ({
      all: members.length,
      beam: members.filter(m => m.member_type === 'beam').length,
      column: members.filter(m => m.member_type === 'column').length,
    }),
    [members],
  )

  const statusCounts = useMemo(
    () => ({
      pass: members.filter(m => m.status === 'pass').length,
      warn: members.filter(m => m.status === 'warn').length,
      fail: members.filter(m => m.status === 'fail').length,
    }),
    [members],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter(m => {
      if (filter === 'beam' && m.member_type !== 'beam') return false
      if (filter === 'column' && m.member_type !== 'column') return false
      if (!q) return true
      return (
        String(m.member_id).includes(q) ||
        m.section_name.toLowerCase().includes(q) ||
        m.member_type.toLowerCase().includes(q)
      )
    })
  }, [members, filter, query])

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header strip — filter toggle + search + status pills */}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="toggle-strip">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            All ({counts.all})
          </button>
          <button type="button" className={filter === 'beam' ? 'active' : ''} onClick={() => setFilter('beam')}>
            Beams ({counts.beam})
          </button>
          <button type="button" className={filter === 'column' ? 'active' : ''} onClick={() => setFilter('column')}>
            Columns ({counts.column})
          </button>
        </div>
        <div className="search" style={{ width: 220 }}>
          <Icon name="search" size={13} />
          <input
            placeholder="Filter by ID / section / type…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="spacer" />
        <span className="mono" style={{ fontSize: 11, color: 'var(--color-ink-3)', display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--color-pass)' }}>{statusCounts.pass} pass</span>
          <span>·</span>
          <span style={{ color: 'var(--color-warn)' }}>{statusCounts.warn} warn</span>
          <span>·</span>
          <span style={{ color: 'var(--color-fail)' }}>{statusCounts.fail} fail</span>
        </span>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="cb" style={{ fontSize: 11.5, color: 'var(--color-ink-3)' }}>
            {members.length === 0
              ? 'No members in this project. Run the bridge to sync STAAD geometry.'
              : 'No members match the current filter.'}
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th style={{ width: 60 }}>Type</th>
                <th>Section</th>
                <th className="num" style={{ width: 110, textAlign: 'right' }}>Length (mm)</th>
                <th className="num" style={{ width: 110, textAlign: 'right' }}>Mu / Ratio</th>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ width: 80, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} className={m.status === 'fail' ? 'fail' : ''}>
                  <td>
                    <span className="mono" style={{ fontWeight: 600 }}>{m.member_id}</span>
                  </td>
                  <td>
                    <span className="tag">{m.member_type.toUpperCase()}</span>
                  </td>
                  <td className="num" style={{ color: 'var(--color-ink-2)' }}>{m.section_name}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{m.length_mm.toFixed(0)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {m.metric != null ? (
                      <span>
                        {m.metric.toFixed(m.metric_label === 'Ratio' ? 2 : 1)}
                        {m.metric_label === 'Mu' ? ' kN·m' : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-ink-4)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={'tag ' + statusClass(m.status)}>
                      {(m.status ?? 'pending').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      disabled
                      className="btn sm"
                      style={{ opacity: 0.6, cursor: 'not-allowed' }}
                      title="Design assignment in Phase 3"
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function statusClass(s?: 'pass' | 'fail' | 'warn' | 'pending') {
  if (s === 'pass') return 'pass'
  if (s === 'fail') return 'fail'
  if (s === 'warn') return 'warn'
  return ''
}
