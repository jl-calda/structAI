'use client'

import { useMemo, useState } from 'react'

import { Tag } from '@/components/ui/Tag'
import type { MemberType } from '@/lib/supabase/types'

type MemberLite = {
  id: string
  member_id: number
  member_type: MemberType
  section_name: string
  length_mm: number
}

type Filter = 'all' | 'beam' | 'column'

export function MembersTable({ members }: { members: MemberLite[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(
    () => ({
      all: members.length,
      beam: members.filter((m) => m.member_type === 'beam').length,
      column: members.filter((m) => m.member_type === 'column').length,
    }),
    [members],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1 rounded border p-0.5 text-[11.5px]"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <FilterTab
            active={filter === 'all'}
            label="All"
            count={counts.all}
            onClick={() => setFilter('all')}
          />
          <FilterTab
            active={filter === 'beam'}
            label="Beams"
            count={counts.beam}
            onClick={() => setFilter('beam')}
          />
          <FilterTab
            active={filter === 'column'}
            label="Columns"
            count={counts.column}
            onClick={() => setFilter('column')}
          />
        </div>
        <input
          type="search"
          placeholder="Search by ID / section / type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 max-w-sm rounded border px-2 py-1.5 text-[12px]"
          style={{ borderColor: 'var(--color-border)' }}
        />
        <div className="ml-auto mono text-[11.5px]"
             style={{ color: 'var(--color-text2)' }}>
          0 designed · {filtered.length} unassigned
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
            {members.length === 0
              ? 'No members in this project. Run the bridge to sync STAAD geometry.'
              : 'No members match the current filter.'}
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Member</th>
                <th>Type</th>
                <th>Section</th>
                <th className="!text-right">Length (mm)</th>
                <th>Group</th>
                <th>Assigned Design</th>
                <th>Status</th>
                <th className="!text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="num font-semibold">{m.member_id}</td>
                  <td>
                    {m.member_type === 'beam' ? (
                      <Tag variant="amber">BEAM</Tag>
                    ) : m.member_type === 'column' ? (
                      <Tag variant="blue">COLUMN</Tag>
                    ) : (
                      <Tag variant="teal">{m.member_type.toUpperCase()}</Tag>
                    )}
                  </td>
                  <td className="mono">{m.section_name}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {m.length_mm.toFixed(0)}
                  </td>
                  <td>—</td>
                  <td style={{ color: 'var(--color-text2)' }}>none</td>
                  <td>
                    <Tag variant="amber">UNASSIGNED</Tag>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      disabled
                      className="rounded px-2 py-1 text-[11.5px] font-semibold disabled:opacity-60 cursor-not-allowed"
                      style={{
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text2)',
                      }}
                      title="Design assignment lands in Phase 3"
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

function FilterTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2 py-1 font-medium transition-colors"
      style={{
        background: active ? 'var(--color-amber-l)' : 'transparent',
        color: active ? 'var(--color-amber)' : 'var(--color-text2)',
      }}
    >
      {label} <span className="mono">{count}</span>
    </button>
  )
}
