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
 * Multi-select member picker driven by the 3D view.
 *   - Click a member in the 3D pane to add it; click again to remove.
 *   - Selected members are highlighted; ineligible members are dimmed.
 *   - Chips above the viewer show what's currently picked.
 *   - Type-IDs input + "Get highlighted" remain as keyboard / STAAD-bridge
 *     fallbacks.
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
  const [fetching, setFetching] = useState(false)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Chip row + controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          alignItems: 'center',
        }}
      >
        {selected.length === 0 && (
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--color-text2)',
              fontStyle: 'italic',
            }}
          >
            Click members in the 3D view to add them.
          </span>
        )}
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
      </div>

      {/* 3D pane — primary picker */}
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
          Click to toggle · {selected.length} selected · {available.length} pickable
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
