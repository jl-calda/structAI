'use client'

import { useMemo, useState } from 'react'

import { FrameViewer3D, type MemberLite, type NodeLite } from '@/components/staad/FrameViewer3D'
import { Icon } from '@/components/ui/Icon'

export type MemberInfo = {
  member_id: number
  section_name: string
  length_mm: number
  member_type?: string
}

export type MemberPicker3DProps = {
  projectId: string
  nodes: NodeLite[]
  members: MemberLite[]
  /** The pickable subset (e.g. only members tagged as beams in STAAD). */
  available: MemberInfo[]
  selected: number[]
  onChange: (ids: number[]) => void
  bridgeOnline?: boolean | null
}

/**
 * Reusable multi-select for STAAD members.
 *   - Chips row at top (selected IDs, removable).
 *   - Chooser controls: dropdown grouped by section + type-IDs input +
 *     "Get highlighted" (from running STAAD).
 *   - 3D pane below: click members to toggle, selected ones highlighted.
 *
 * `available` controls what's pickable. All other members are still
 * rendered in the 3D pane but dimmed and non-clickable so the user has
 * the full geometric context.
 */
export function MemberPicker3D({
  projectId,
  nodes,
  members,
  available,
  selected,
  onChange,
  bridgeOnline = null,
}: MemberPicker3DProps) {
  const [open, setOpen] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [filter, setFilter] = useState('')
  const [inputVal, setInputVal] = useState('')

  const availableIds = useMemo(
    () => new Set(available.map((m) => m.member_id)),
    [available],
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const dimmedIds = useMemo(() => {
    const s = new Set<number>()
    for (const m of members) {
      if (!availableIds.has(m.member_id)) s.add(m.member_id)
    }
    return s
  }, [members, availableIds])

  const removeMember = (id: number) => onChange(selected.filter((x) => x !== id))

  const toggleMember = (id: number) => {
    if (!availableIds.has(id)) return
    if (selectedSet.has(id)) onChange(selected.filter((x) => x !== id))
    else onChange([...selected, id])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputVal.trim()) {
      e.preventDefault()
      const ids = inputVal
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0 && availableIds.has(n))
      onChange([...new Set([...selected, ...ids])])
      setInputVal('')
    }
  }

  const getHighlighted = async () => {
    setFetching(true)
    try {
      const res = await fetch('/api/bridge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'selected', project_id: projectId }),
      })
      const json = await res.json()
      if (json.ok && Array.isArray(json.members) && json.members.length > 0) {
        const ids = json.members
          .map((m: MemberInfo) => m.member_id)
          .filter((id: number) => availableIds.has(id))
        onChange([...new Set([...selected, ...ids])])
      }
    } catch {
      /* bridge offline — ignore */
    }
    setFetching(false)
  }

  const filtered = useMemo(() => {
    if (!filter) return available
    const f = filter.toLowerCase()
    return available.filter(
      (m) =>
        m.member_id.toString().includes(filter) ||
        m.section_name.toLowerCase().includes(f),
    )
  }, [available, filter])

  const sections = useMemo(
    () => [...new Set(filtered.map((m) => m.section_name))],
    [filtered],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Chip row + controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {selected.map((id) => {
          const m = available.find((a) => a.member_id === id)
          return (
            <span
              key={id}
              className="tag"
              style={{
                fontSize: 9,
                padding: '0 4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span className="mono">{id}</span>
              {m && (
                <span style={{ color: 'var(--color-ink-4)', fontSize: 8 }}>
                  {m.section_name} · {m.length_mm}mm
                </span>
              )}
              <button
                type="button"
                onClick={() => removeMember(id)}
                style={{
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-fail)',
                  fontSize: 10,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          )
        })}

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="btn sm"
          style={{ height: 18, fontSize: 9.5, padding: '0 6px' }}
        >
          <Icon name="plus" size={8} /> Choose members
        </button>

        {bridgeOnline && (
          <button
            type="button"
            onClick={getHighlighted}
            disabled={fetching}
            className="btn sm"
            style={{
              height: 18,
              fontSize: 9.5,
              padding: '0 6px',
              background: 'var(--color-sel-bg, #E8F0FA)',
              borderColor: 'var(--color-sel, #2563AB)',
              color: 'var(--color-sel, #2563AB)',
            }}
          >
            {fetching ? '…' : (
              <>
                <Icon name="sync" size={8} /> Get highlighted
              </>
            )}
          </button>
        )}

        <input
          className="input"
          placeholder="or type IDs…"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ width: 80, height: 18, fontSize: 10, padding: '0 4px' }}
        />

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="btn sm ghost"
            style={{ height: 18, fontSize: 9.5, padding: '0 6px' }}
          >
            Clear
          </button>
        )}

        {/* Dropdown panel */}
        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 20,
              width: 420,
              maxHeight: 280,
              overflow: 'hidden',
              background: 'var(--color-panel)',
              border: '1px solid var(--color-line)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              marginTop: 4,
            }}
          >
            <div
              style={{
                padding: '6px 8px',
                borderBottom: '1px solid var(--color-line-2)',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <Icon name="search" size={10} />
              <input
                className="input"
                placeholder="Filter by ID or section…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
                style={{ flex: 1, height: 22, fontSize: 11 }}
              />
              <span
                className="mono"
                style={{ fontSize: 9, color: 'var(--color-ink-4)' }}
              >
                {selected.length} sel
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-ink-3)',
                  fontSize: 14,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              {sections.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    fontSize: 11,
                    color: 'var(--color-ink-4)',
                  }}
                >
                  No members found
                </div>
              ) : (
                sections.map((sec) => {
                  const membersInSec = filtered.filter(
                    (m) => m.section_name === sec,
                  )
                  const allSelected = membersInSec.every((m) =>
                    selectedSet.has(m.member_id),
                  )
                  const someSelected = membersInSec.some((m) =>
                    selectedSet.has(m.member_id),
                  )

                  const toggleSection = () => {
                    const secIds = membersInSec.map((m) => m.member_id)
                    if (allSelected) {
                      onChange(selected.filter((id) => !secIds.includes(id)))
                    } else {
                      onChange([...new Set([...selected, ...secIds])])
                    }
                  }

                  return (
                    <div key={sec}>
                      <div
                        onClick={toggleSection}
                        style={{
                          padding: '4px 8px',
                          background: 'var(--color-bg)',
                          borderBottom: '1px solid var(--color-line-2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: 'var(--color-ink-2)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          readOnly
                          style={{ pointerEvents: 'none' }}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected && !allSelected
                          }}
                        />
                        <span>{sec}</span>
                        <span
                          className="mono"
                          style={{
                            color: 'var(--color-ink-4)',
                            fontWeight: 400,
                            fontSize: 9,
                          }}
                        >
                          {membersInSec.length} members
                        </span>
                      </div>
                      {membersInSec.map((m) => (
                        <label
                          key={m.member_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '2px 8px 2px 20px',
                            cursor: 'pointer',
                            fontSize: 10.5,
                            background: selectedSet.has(m.member_id)
                              ? 'var(--color-sel-bg, #E8F0FA)'
                              : 'transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSet.has(m.member_id)}
                            onChange={() => toggleMember(m.member_id)}
                          />
                          <span
                            className="mono"
                            style={{ width: 36, fontWeight: 600 }}
                          >
                            {m.member_id}
                          </span>
                          <span
                            style={{ color: 'var(--color-ink-3)', flex: 1 }}
                          >
                            {m.section_name}
                          </span>
                          <span
                            className="mono"
                            style={{ color: 'var(--color-ink-4)', fontSize: 9 }}
                          >
                            {m.length_mm} mm
                          </span>
                        </label>
                      ))}
                    </div>
                  )
                })
              )}
            </div>

            <div
              style={{
                padding: '4px 8px',
                borderTop: '1px solid var(--color-line-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg)',
                fontSize: 10,
              }}
            >
              <span style={{ color: 'var(--color-ink-4)' }}>
                {filtered.length} members · {selected.length} selected
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3D pane */}
      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: 6,
            zIndex: 1,
            fontSize: 10,
            color: 'var(--color-text2)',
            background: 'var(--color-panel)',
            padding: '1px 6px',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        >
          Click members to toggle · {selected.length} selected
        </div>
        <FrameViewer3D
          projectId={projectId}
          nodes={nodes}
          members={members}
          assignments={{}}
          selectedMemberIds={selectedSet}
          onMemberToggle={toggleMember}
          dimmedMemberIds={dimmedIds.size > 0 ? dimmedIds : undefined}
        />
      </div>
    </div>
  )
}
