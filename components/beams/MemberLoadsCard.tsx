'use client'

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * Step 1b — Member Definition & Loads for beams.
 *
 * Supports three data sources:
 *   1. Cached DB (default) — reads from staad_envelope via /api/design/member-forces
 *   2. Live OpenSTAAD — queries the running STAAD model via bridge /query/* endpoints
 *   3. Manual — user enters forces directly
 *
 * Multiple instances: a design B-1 may map to several physical beams in STAAD.
 * Each instance is a group of member IDs. The governing envelope drives the design.
 */

type MemberInfo = { member_id: number; section_name: string; length_mm: number; member_type: string }

type InstanceData = {
  id: number
  label: string
  memberIds: number[]
  span_mm: number
  forces: { mpos: number; mneg: number; vu: number } | null
  loading: boolean
}

let instanceIdCounter = 1

export type BeamMemberLoadsCardProps = {
  projectId: string
  initialMemberIds: number[]
  allMembers: MemberInfo[]
  designLabel: string
}

export function BeamMemberLoadsCard({
  projectId,
  initialMemberIds,
  allMembers,
  designLabel,
}: BeamMemberLoadsCardProps) {
  const [mode, setMode] = useState<'staad' | 'live' | 'manual'>(initialMemberIds.length > 0 ? 'staad' : 'manual')
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null)

  const [instances, setInstances] = useState<InstanceData[]>(() => {
    if (initialMemberIds.length === 0) return []
    return [{
      id: instanceIdCounter++,
      label: `${designLabel}-1`,
      memberIds: initialMemberIds,
      span_mm: 0,
      forces: null,
      loading: false,
    }]
  })

  const [manualMpos, setManualMpos] = useState(0)
  const [manualMneg, setManualMneg] = useState(0)
  const [manualVu, setManualVu] = useState(0)
  const [manualSpan, setManualSpan] = useState(6000)

  // Combo range filter — e.g. [{from: 100, to: 124}, {from: 200, to: 211}]
  const [comboRanges, setComboRanges] = useState<{ from: number; to: number }[]>([
    { from: 100, to: 124 },
  ])

  // Live search state
  const [searchSection, setSearchSection] = useState('')
  const [searchResults, setSearchResults] = useState<MemberInfo[]>([])
  const [searching, setSearching] = useState(false)

  const beamMembers = allMembers.filter(m => m.member_type === 'beam' || m.member_type === 'BEAM')

  // Check bridge status on mount
  useEffect(() => {
    fetch('/api/bridge/status')
      .then(r => r.json())
      .then(d => setBridgeOnline(d.connected === true))
      .catch(() => setBridgeOnline(false))
  }, [])

  // Build combo query string from ranges
  const comboQueryStr = comboRanges
    .filter(r => r.from > 0 && r.to >= r.from)
    .map(r => `${r.from}-${r.to}`)
    .join(',')

  const fetchForcesCached = useCallback(async (inst: InstanceData) => {
    if (inst.memberIds.length === 0) return
    setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: true } : i))
    try {
      const comboParam = comboQueryStr ? `&combos=${comboQueryStr}` : ''
      const res = await fetch(`/api/design/member-forces?projectId=${projectId}&memberIds=${inst.memberIds.join(',')}${comboParam}`)
      const json = await res.json()
      if (json.ok) {
        const d = json.data
        setInstances(prev => prev.map(i => i.id === inst.id ? {
          ...i,
          span_mm: d.totalSpan,
          forces: { mpos: d.envelope.mpos_max, mneg: d.envelope.mneg_max, vu: d.envelope.vu_max },
          loading: false,
        } : i))
      } else {
        setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: false } : i))
      }
    } catch {
      setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: false } : i))
    }
  }, [projectId])

  const fetchForcesLive = useCallback(async (inst: InstanceData) => {
    if (inst.memberIds.length === 0) return
    setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: true } : i))
    try {
      const res = await fetch('/api/bridge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forces', project_id: projectId, member_ids: inst.memberIds }),
      })
      const json = await res.json()
      if (json.ok) {
        setInstances(prev => prev.map(i => i.id === inst.id ? {
          ...i,
          span_mm: json.totalSpan,
          forces: {
            mpos: json.envelope.mpos_max,
            mneg: Math.abs(json.envelope.mneg_max),
            vu: json.envelope.vu_max,
          },
          loading: false,
        } : i))
      } else {
        setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: false } : i))
      }
    } catch {
      setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: false } : i))
    }
  }, [projectId])

  const fetchForces = mode === 'live' ? fetchForcesLive : fetchForcesCached

  useEffect(() => {
    for (const inst of instances) {
      if (inst.forces === null && inst.memberIds.length > 0 && !inst.loading) {
        fetchForces(inst)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addInstance = () => {
    const n = instances.length + 1
    setInstances(prev => [...prev, {
      id: instanceIdCounter++,
      label: `${designLabel}-${n}`,
      memberIds: [],
      span_mm: 0,
      forces: null,
      loading: false,
    }])
  }

  const removeInstance = (id: number) => {
    setInstances(prev => prev.filter(i => i.id !== id))
  }

  const updateMemberIds = (instId: number, ids: number[]) => {
    setInstances(prev => prev.map(i => i.id === instId ? { ...i, memberIds: ids, forces: null } : i))
  }

  const refreshInstance = (inst: InstanceData) => { fetchForces(inst) }

  const refreshAll = () => { instances.forEach(inst => fetchForces(inst)) }

  // Live search from OpenSTAAD
  const searchSTAAD = async () => {
    if (!searchSection.trim()) return
    setSearching(true)
    try {
      const res = await fetch('/api/bridge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          project_id: projectId,
          section_name: searchSection.trim(),
          member_type: 'BEAM',
        }),
      })
      const json = await res.json()
      if (json.ok) setSearchResults(json.members ?? [])
    } catch { /* bridge offline */ }
    setSearching(false)
  }

  const addSearchResultAsInstance = (members: MemberInfo[]) => {
    const ids = members.map(m => m.member_id)
    const inst: InstanceData = {
      id: instanceIdCounter++,
      label: `${designLabel}-${instances.length + 1}`,
      memberIds: ids,
      span_mm: members.reduce((s, m) => s + m.length_mm, 0),
      forces: null,
      loading: false,
    }
    setInstances(prev => [...prev, inst])
    fetchForces(inst)
  }

  const governing = instances.reduce((gov, inst) => {
    if (!inst.forces) return gov
    return {
      mpos: Math.max(gov.mpos, inst.forces.mpos),
      mneg: Math.max(gov.mneg, inst.forces.mneg),
      vu: Math.max(gov.vu, inst.forces.vu),
    }
  }, { mpos: 0, mneg: 0, vu: 0 })

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">1b</span>
        <span className="label">Member Definition &amp; Loads</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          {mode === 'manual' ? 'manual input' : `${instances.length} instance${instances.length !== 1 ? 's' : ''} · ${mode === 'live' ? 'live OpenSTAAD' : 'cached DB'}`}
        </span>
        <div className="right">
          {bridgeOnline !== null && (
            <span style={{ fontSize: 9.5, color: bridgeOnline ? 'var(--color-pass)' : 'var(--color-ink-4)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: bridgeOnline ? 'var(--color-pass)' : 'var(--color-ink-5)' }} />
              {bridgeOnline ? 'Bridge online' : 'Bridge offline'}
            </span>
          )}
          <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)' }}>
            {['staad', 'live', 'manual'].map(m => (
              <button key={m} type="button" onClick={() => setMode(m as typeof mode)} style={{
                padding: '2px 10px', fontSize: 10.5, fontWeight: 600, borderRadius: 3, border: 0, cursor: 'pointer',
                background: mode === m ? 'var(--color-ink)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--color-ink-3)',
                opacity: m === 'live' && !bridgeOnline ? 0.4 : 1,
              }} disabled={m === 'live' && bridgeOnline === false}>
                {m === 'staad' ? 'Cached' : m === 'live' ? 'Live' : 'Manual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <ManualField label="Span" unit="mm" value={manualSpan} onChange={setManualSpan} />
          <ManualField label="M⁺ (sagging)" unit="kN·m" value={manualMpos} onChange={setManualMpos} />
          <ManualField label="M⁻ (hogging)" unit="kN·m" value={manualMneg} onChange={setManualMneg} />
          <ManualField label="Vu (shear)" unit="kN" value={manualVu} onChange={setManualVu} />
        </div>
      ) : (
        <div>
          {/* Combo range filter */}
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, minWidth: 80 }}>
              Combo filter
            </span>
            {comboRanges.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {i > 0 && <span style={{ color: 'var(--color-ink-4)', fontSize: 10 }}>,</span>}
                <input className="input" type="number" value={r.from}
                  onChange={e => setComboRanges(prev => prev.map((rr, j) => j === i ? { ...rr, from: Number(e.target.value) || 0 } : rr))}
                  style={{ width: 50, height: 20, fontSize: 10.5, textAlign: 'center' }} />
                <span style={{ color: 'var(--color-ink-4)', fontSize: 10 }}>–</span>
                <input className="input" type="number" value={r.to}
                  onChange={e => setComboRanges(prev => prev.map((rr, j) => j === i ? { ...rr, to: Number(e.target.value) || 0 } : rr))}
                  style={{ width: 50, height: 20, fontSize: 10.5, textAlign: 'center' }} />
                {comboRanges.length > 1 && (
                  <button type="button" onClick={() => setComboRanges(prev => prev.filter((_, j) => j !== i))}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 12, padding: 0 }}>×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setComboRanges(prev => [...prev, { from: 0, to: 0 }])}
              className="btn sm" style={{ height: 20, fontSize: 9, padding: '0 6px' }}>
              <Icon name="plus" size={8} /> Range
            </button>
            <span className="mono" style={{ fontSize: 9, color: 'var(--color-ink-4)', marginLeft: 4 }}>
              {comboQueryStr ? `LC ${comboQueryStr}` : 'all combos'}
            </span>
          </div>

          {/* Live search bar (visible in live mode) */}
          {mode === 'live' && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="search" size={11} />
              <input
                className="input"
                placeholder="Search STAAD by section name (e.g. ISMB300)…"
                value={searchSection}
                onChange={e => setSearchSection(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchSTAAD()}
                style={{ flex: 1, height: 24, fontSize: 11.5 }}
              />
              <button type="button" className="btn sm" onClick={searchSTAAD} disabled={searching}>
                {searching ? 'Searching…' : 'Search STAAD'}
              </button>
              {searchResults.length > 0 && (
                <>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-3)' }}>
                    {searchResults.length} found
                  </span>
                  <button type="button" className="btn sm" onClick={() => addSearchResultAsInstance(searchResults)}>
                    <Icon name="plus" size={9} /> Add all as instance
                  </button>
                </>
              )}
            </div>
          )}

          {/* Search results preview */}
          {mode === 'live' && searchResults.length > 0 && (
            <div style={{ padding: '4px 10px 6px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {searchResults.slice(0, 30).map(m => (
                <span key={m.member_id} className="tag" style={{ fontSize: 9, padding: '1px 5px' }}>
                  <span className="mono">{m.member_id}</span>
                  <span style={{ color: 'var(--color-ink-4)', fontSize: 8, marginLeft: 3 }}>{m.section_name} · {m.length_mm}mm</span>
                </span>
              ))}
              {searchResults.length > 30 && (
                <span style={{ fontSize: 9, color: 'var(--color-ink-4)' }}>+{searchResults.length - 30} more</span>
              )}
            </div>
          )}

          {/* Instances table */}
          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>Instance</th>
                <th>STAAD Members</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>Span (mm)</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>M⁺ (kN·m)</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>M⁻ (kN·m)</th>
                <th className="num" style={{ width: 70, textAlign: 'right' }}>V (kN)</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {instances.map(inst => (
                <tr key={inst.id}>
                  <td>
                    <input className="input" value={inst.label} style={{ width: 80, height: 20, fontSize: 10.5 }}
                      onChange={e => setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, label: e.target.value } : i))} />
                  </td>
                  <td>
                    <MemberPicker
                      available={beamMembers}
                      selected={inst.memberIds}
                      onChange={ids => updateMemberIds(inst.id, ids)}
                      projectId={projectId}
                      bridgeOnline={bridgeOnline}
                    />
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.span_mm > 0 ? inst.span_mm.toFixed(0) : '—'}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {inst.loading ? <span style={{ color: 'var(--color-ink-4)', fontSize: 10 }}>…</span> :
                      <span className="mono">{inst.forces ? inst.forces.mpos.toFixed(1) : '—'}</span>}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.forces ? inst.forces.mneg.toFixed(1) : '—'}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.forces ? inst.forces.vu.toFixed(1) : '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" onClick={() => refreshInstance(inst)} title="Refresh forces"
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-ink-3)', fontSize: 11, padding: 2 }}>
                        <Icon name="sync" size={10} />
                      </button>
                      <button type="button" onClick={() => removeInstance(inst.id)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 13, padding: 2 }}>
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--color-line-2)' }}>
            <button type="button" className="btn sm" onClick={addInstance}>
              <Icon name="plus" size={10} /> Add instance
            </button>
            {instances.length > 1 && (
              <button type="button" className="btn sm ghost" onClick={refreshAll}>
                <Icon name="sync" size={10} /> Refresh all
              </button>
            )}
            <div className="spacer" />
            {instances.length > 0 && (
              <div style={{ display: 'flex', gap: 12, fontSize: 10.5 }}>
                <span style={{ color: 'var(--color-ink-3)' }}>Governing:</span>
                <span className="mono" style={{ fontWeight: 600 }}>M⁺ = {governing.mpos.toFixed(1)} kN·m</span>
                <span className="mono" style={{ fontWeight: 600 }}>M⁻ = {governing.mneg.toFixed(1)} kN·m</span>
                <span className="mono" style={{ fontWeight: 600 }}>V = {governing.vu.toFixed(1)} kN</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MemberPicker({
  available,
  selected,
  onChange,
  projectId,
  bridgeOnline,
}: {
  available: MemberInfo[]
  selected: number[]
  onChange: (ids: number[]) => void
  projectId: string
  bridgeOnline: boolean | null
}) {
  const [open, setOpen] = useState(false)
  const [fetching, setFetching] = useState(false)

  const getHighlighted = async () => {
    setFetching(true)
    try {
      const res = await fetch('/api/bridge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'selected', project_id: projectId }),
      })
      const json = await res.json()
      if (json.ok && json.members?.length > 0) {
        const ids = json.members.map((m: MemberInfo) => m.member_id)
        onChange([...new Set([...selected, ...ids])])
      }
    } catch { /* bridge offline */ }
    setFetching(false)
  }
  const [filter, setFilter] = useState('')
  const [inputVal, setInputVal] = useState('')

  const removeMember = (id: number) => {
    onChange(selected.filter(x => x !== id))
  }

  const toggleMember = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputVal.trim()) {
      const ids = inputVal.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)
      onChange([...new Set([...selected, ...ids])])
      setInputVal('')
    }
  }

  const filtered = filter
    ? available.filter(m =>
      m.member_id.toString().includes(filter) ||
      m.section_name.toLowerCase().includes(filter.toLowerCase()),
    )
    : available

  // Group by section name for easier browsing
  const sections = [...new Set(filtered.map(m => m.section_name))]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', position: 'relative' }}>
      {selected.map(id => {
        const m = available.find(a => a.member_id === id)
        return (
          <span key={id} className="tag" style={{ fontSize: 9, padding: '0 4px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <span className="mono">{id}</span>
            {m && <span style={{ color: 'var(--color-ink-4)', fontSize: 8 }}>{m.section_name} · {m.length_mm}mm</span>}
            <button type="button" onClick={() => removeMember(id)}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 10, padding: 0, lineHeight: 1 }}>
              ×
            </button>
          </span>
        )
      })}

      <button type="button" onClick={() => setOpen(!open)}
        className="btn sm" style={{ height: 18, fontSize: 9.5, padding: '0 6px' }}>
        <Icon name="plus" size={8} /> Choose members
      </button>

      {bridgeOnline && (
        <button type="button" onClick={getHighlighted} disabled={fetching}
          className="btn sm" style={{ height: 18, fontSize: 9.5, padding: '0 6px', background: 'var(--color-sel-bg, #E8F0FA)', borderColor: 'var(--color-sel, #2563AB)', color: 'var(--color-sel, #2563AB)' }}>
          {fetching ? '…' : <><Icon name="sync" size={8} /> Get highlighted</>}
        </button>
      )}

      <input
        className="input"
        placeholder="or type IDs…"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ width: 80, height: 18, fontSize: 10, padding: '0 4px' }}
      />

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 20,
          width: 420, maxHeight: 280, overflow: 'hidden',
          background: 'var(--color-panel)', border: '1px solid var(--color-line)',
          borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Search + actions */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="search" size={10} />
            <input
              className="input"
              placeholder="Filter by ID or section…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              autoFocus
              style={{ flex: 1, height: 22, fontSize: 11 }}
            />
            <span className="mono" style={{ fontSize: 9, color: 'var(--color-ink-4)' }}>
              {selected.length} sel
            </span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-ink-3)', fontSize: 14 }}>
              ×
            </button>
          </div>

          {/* Member list grouped by section */}
          <div style={{ overflow: 'auto', flex: 1 }}>
            {sections.length === 0 ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--color-ink-4)' }}>No members found</div>
            ) : sections.map(sec => {
              const membersInSec = filtered.filter(m => m.section_name === sec)
              const allSelected = membersInSec.every(m => selected.includes(m.member_id))
              const someSelected = membersInSec.some(m => selected.includes(m.member_id))

              const toggleSection = () => {
                const secIds = membersInSec.map(m => m.member_id)
                if (allSelected) {
                  onChange(selected.filter(id => !secIds.includes(id)))
                } else {
                  onChange([...new Set([...selected, ...secIds])])
                }
              }

              return (
                <div key={sec}>
                  {/* Section header — click to select all in section */}
                  <div
                    onClick={toggleSection}
                    style={{
                      padding: '4px 8px', background: 'var(--color-bg)',
                      borderBottom: '1px solid var(--color-line-2)',
                      display: 'flex', alignItems: 'center', gap: 6,
                      cursor: 'pointer', fontSize: 10.5, fontWeight: 600,
                      color: 'var(--color-ink-2)',
                    }}
                  >
                    <input type="checkbox" checked={allSelected} readOnly
                      style={{ pointerEvents: 'none' }}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                    />
                    <span>{sec}</span>
                    <span className="mono" style={{ color: 'var(--color-ink-4)', fontWeight: 400, fontSize: 9 }}>
                      {membersInSec.length} members
                    </span>
                  </div>
                  {/* Individual members */}
                  {membersInSec.map(m => (
                    <label key={m.member_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '2px 8px 2px 20px', cursor: 'pointer', fontSize: 10.5,
                        background: selected.includes(m.member_id) ? 'var(--color-sel-bg, #E8F0FA)' : 'transparent',
                      }}
                    >
                      <input type="checkbox"
                        checked={selected.includes(m.member_id)}
                        onChange={() => toggleMember(m.member_id)}
                      />
                      <span className="mono" style={{ width: 36, fontWeight: 600 }}>{m.member_id}</span>
                      <span style={{ color: 'var(--color-ink-3)', flex: 1 }}>{m.section_name}</span>
                      <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 9 }}>{m.length_mm} mm</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: '4px 8px', borderTop: '1px solid var(--color-line-2)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--color-bg)', fontSize: 10,
          }}>
            <span style={{ color: 'var(--color-ink-4)' }}>{filtered.length} members · {selected.length} selected</span>
            <button type="button" className="btn sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ManualField({ label, unit, value, onChange }: {
  label: string; unit: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9.5, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input className="input" type="number" value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          style={{ flex: 1, height: 24, fontSize: 12 }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{unit}</span>
      </div>
    </div>
  )
}
