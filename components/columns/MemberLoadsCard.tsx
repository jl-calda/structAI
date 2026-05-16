'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { FrameViewer3D, type MemberLite, type NodeLite } from '@/components/staad/FrameViewer3D'
import type { MemberRow, NodeRow } from '@/lib/data/staad'

/**
 * Step 1b — Member Definition & Loads for columns.
 *
 * Supports three data sources:
 *   1. Cached DB — reads from staad_envelope via /api/design/member-forces
 *   2. Live OpenSTAAD — queries running STAAD via bridge /query/* endpoints
 *   3. Manual — user enters Pu, Mu, Vu directly
 *
 * Multiple instances: C-1 may represent several physical columns in STAAD.
 * The governing forces across all instances drive the design.
 */

type MemberInfo = { member_id: number; section_name: string; length_mm: number; member_type: string }

type InstanceData = {
  id: number
  label: string
  memberIds: number[]
  height_mm: number
  forces: { pu: number; mu_major: number; mu_minor: number; vu: number } | null
  loading: boolean
}

let instanceIdCounter = 1

const INSTANCE_COLORS = [
  '#1755A0', // blue
  '#D4820F', // amber
  '#0D9488', // teal
  '#7C3AED', // purple
  '#16A34A', // green
  '#DC2626', // red
  '#DB2777', // pink
  '#CA8A04', // yellow
]

export type ColumnMemberLoadsCardProps = {
  projectId: string
  initialMemberIds: number[]
  allMembers: MemberInfo[]
  allMemberRows: MemberRow[]
  allNodes: NodeRow[]
  designLabel: string
}

export function ColumnMemberLoadsCard({
  projectId,
  initialMemberIds,
  allMembers,
  allMemberRows,
  allNodes,
  designLabel,
}: ColumnMemberLoadsCardProps) {
  const [mode, setMode] = useState<'staad' | 'live' | 'manual'>(initialMemberIds.length > 0 ? 'staad' : 'manual')
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null)

  const [instances, setInstances] = useState<InstanceData[]>(() => {
    if (initialMemberIds.length === 0) return []
    return [{
      id: instanceIdCounter++,
      label: `${designLabel}-1`,
      memberIds: initialMemberIds,
      height_mm: 0,
      forces: null,
      loading: false,
    }]
  })

  const [manualPu, setManualPu] = useState(0)
  const [manualMuMajor, setManualMuMajor] = useState(0)
  const [manualMuMinor, setManualMuMinor] = useState(0)
  const [manualVu, setManualVu] = useState(0)
  const [manualHeight, setManualHeight] = useState(3000)

  const [comboRanges, setComboRanges] = useState<{ from: number; to: number }[]>([
    { from: 100, to: 124 },
  ])

  const [searchSection, setSearchSection] = useState('')
  const [searchResults, setSearchResults] = useState<MemberInfo[]>([])
  const [searching, setSearching] = useState(false)

  const columnMembers = allMembers.filter(m => m.member_type === 'column' || m.member_type === 'COLUMN')

  const [activeInstanceId, setActiveInstanceId] = useState<number | null>(
    () => instances.length > 0 ? instances[0].id : null,
  )

  const columnMemberIds = useMemo(
    () => new Set(columnMembers.map(m => m.member_id)),
    [columnMembers],
  )
  const dimmedIds = useMemo(() => {
    const s = new Set<number>()
    for (const m of allMemberRows) {
      if (!columnMemberIds.has(m.member_id)) s.add(m.member_id)
    }
    return s
  }, [allMemberRows, columnMemberIds])

  const memberColorMap = useMemo(() => {
    const m = new Map<number, string>()
    instances.forEach((inst, idx) => {
      const c = INSTANCE_COLORS[idx % INSTANCE_COLORS.length]
      for (const mid of inst.memberIds) {
        m.set(mid, c)
      }
    })
    return m
  }, [instances])

  const activeInstance = instances.find(i => i.id === activeInstanceId) ?? null
  const activeSelectedSet = useMemo(
    () => new Set(activeInstance?.memberIds ?? []),
    [activeInstance],
  )

  const handleMemberToggle = (memberId: number) => {
    if (!columnMemberIds.has(memberId)) return
    if (!activeInstance) {
      addInstance()
      return
    }
    const ids = activeInstance.memberIds
    if (ids.includes(memberId)) {
      updateMemberIds(activeInstance.id, ids.filter(id => id !== memberId))
    } else {
      updateMemberIds(activeInstance.id, [...ids, memberId])
    }
  }

  useEffect(() => {
    fetch('/api/bridge/status')
      .then(r => r.json())
      .then(d => setBridgeOnline(d.connected === true))
      .catch(() => setBridgeOnline(false))
  }, [])

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
          height_mm: d.totalSpan,
          forces: { pu: d.envelope.nu_comp_max, mu_major: d.envelope.mpos_max, mu_minor: d.envelope.mpos_minor_max ?? 0, vu: d.envelope.vu_max },
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
          height_mm: json.totalSpan,
          forces: {
            pu: json.envelope.nu_comp_max,
            mu_major: json.envelope.mpos_max,
            mu_minor: 0,
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
    const newId = instanceIdCounter++
    setInstances(prev => [...prev, {
      id: newId,
      label: `${designLabel}-${n}`,
      memberIds: [],
      height_mm: 0,
      forces: null,
      loading: false,
    }])
    setActiveInstanceId(newId)
  }

  const removeInstance = (id: number) => {
    setInstances(prev => prev.filter(i => i.id !== id))
  }

  const updateMemberIds = (instId: number, ids: number[]) => {
    setInstances(prev => prev.map(i => i.id === instId ? { ...i, memberIds: ids, forces: null } : i))
  }

  const refreshInstance = (inst: InstanceData) => { fetchForces(inst) }
  const refreshAll = () => { instances.forEach(inst => fetchForces(inst)) }

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
          member_type: 'COLUMN',
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
      height_mm: members.reduce((s, m) => s + m.length_mm, 0),
      forces: null,
      loading: false,
    }
    setInstances(prev => [...prev, inst])
    fetchForces(inst)
  }

  const governing = instances.reduce((gov, inst) => {
    if (!inst.forces) return gov
    return {
      pu: Math.max(gov.pu, inst.forces.pu),
      mu_major: Math.max(gov.mu_major, inst.forces.mu_major),
      mu_minor: Math.max(gov.mu_minor, inst.forces.mu_minor),
      vu: Math.max(gov.vu, inst.forces.vu),
    }
  }, { pu: 0, mu_major: 0, mu_minor: 0, vu: 0 })

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
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <ManualField label="Height" unit="mm" value={manualHeight} onChange={setManualHeight} />
          <ManualField label="Pu (axial)" unit="kN" value={manualPu} onChange={setManualPu} />
          <ManualField label="Mu,x (major)" unit="kN·m" value={manualMuMajor} onChange={setManualMuMajor} />
          <ManualField label="Mu,y (minor)" unit="kN·m" value={manualMuMinor} onChange={setManualMuMinor} />
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

          {mode === 'live' && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name="search" size={11} />
              <input className="input" placeholder="Search STAAD by section name (e.g. 400×400)…"
                value={searchSection} onChange={e => setSearchSection(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchSTAAD()}
                style={{ flex: 1, height: 24, fontSize: 11.5 }} />
              <button type="button" className="btn sm" onClick={searchSTAAD} disabled={searching}>
                {searching ? 'Searching…' : 'Search STAAD'}
              </button>
              {searchResults.length > 0 && (
                <>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-3)' }}>{searchResults.length} found</span>
                  <button type="button" className="btn sm" onClick={() => addSearchResultAsInstance(searchResults)}>
                    <Icon name="plus" size={9} /> Add all as instance
                  </button>
                </>
              )}
            </div>
          )}

          {mode === 'live' && searchResults.length > 0 && (
            <div style={{ padding: '4px 10px 6px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {searchResults.slice(0, 30).map(m => (
                <span key={m.member_id} className="tag" style={{ fontSize: 9, padding: '1px 5px' }}>
                  <span className="mono">{m.member_id}</span>
                  <span style={{ color: 'var(--color-ink-4)', fontSize: 8, marginLeft: 3 }}>{m.section_name} · {m.length_mm}mm</span>
                </span>
              ))}
            </div>
          )}

          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th style={{ width: 100 }}>Instance</th>
                <th>STAAD Members</th>
                <th className="num" style={{ width: 70, textAlign: 'right' }}>H (mm)</th>
                <th className="num" style={{ width: 70, textAlign: 'right' }}>Pu (kN)</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>Mu,x (kN·m)</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>Mu,y (kN·m)</th>
                <th className="num" style={{ width: 60, textAlign: 'right' }}>Vu (kN)</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst, idx) => {
                const instColor = INSTANCE_COLORS[idx % INSTANCE_COLORS.length]
                const isActive = activeInstanceId === inst.id
                return (
                <tr key={inst.id}
                  onClick={() => setActiveInstanceId(inst.id)}
                  style={{
                    cursor: 'pointer',
                    background: isActive ? 'var(--color-sel-bg, #E8F0FA)' : undefined,
                  }}>
                  <td style={{ padding: '0 4px' }}>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12, borderRadius: 2,
                      background: instColor, border: isActive ? '2px solid var(--color-ink)' : '1px solid transparent',
                    }} />
                  </td>
                  <td>
                    <input className="input" value={inst.label} style={{ width: 80, height: 20, fontSize: 10.5 }}
                      onChange={e => setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, label: e.target.value } : i))}
                      onClick={e => e.stopPropagation()} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                      {inst.memberIds.length === 0 && (
                        <span style={{ fontSize: 9.5, color: 'var(--color-ink-4)', fontStyle: 'italic' }}>
                          {isActive ? 'click members in 3D below' : 'click row to activate'}
                        </span>
                      )}
                      {inst.memberIds.map(mid => (
                        <span key={mid} className="tag" style={{
                          fontSize: 9, padding: '0 4px', display: 'inline-flex',
                          alignItems: 'center', gap: 2,
                          borderLeft: `3px solid ${instColor}`,
                        }}>
                          <span className="mono">{mid}</span>
                          <button type="button"
                            onClick={e => { e.stopPropagation(); updateMemberIds(inst.id, inst.memberIds.filter(x => x !== mid)) }}
                            style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 10, padding: 0, lineHeight: 1 }}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.height_mm > 0 ? inst.height_mm.toFixed(0) : '—'}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {inst.loading ? <span style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>…</span> :
                      <span className="mono">{inst.forces ? inst.forces.pu.toFixed(1) : '—'}</span>}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.forces ? inst.forces.mu_major.toFixed(1) : '—'}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.forces ? inst.forces.mu_minor.toFixed(1) : '—'}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.forces ? inst.forces.vu.toFixed(1) : '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button type="button" onClick={e => { e.stopPropagation(); refreshInstance(inst) }} title="Refresh"
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-ink-3)', fontSize: 11, padding: 2 }}>
                        <Icon name="sync" size={10} />
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); removeInstance(inst.id) }}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 13, padding: 2 }}>
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
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
                <span className="mono" style={{ fontWeight: 600 }}>Pu = {governing.pu.toFixed(1)} kN</span>
                <span className="mono" style={{ fontWeight: 600 }}>Mu,x = {governing.mu_major.toFixed(1)}</span>
                <span className="mono" style={{ fontWeight: 600 }}>Mu,y = {governing.mu_minor.toFixed(1)}</span>
                <span className="mono" style={{ fontWeight: 600 }}>Vu = {governing.vu.toFixed(1)} kN</span>
              </div>
            )}
          </div>

          {/* Shared 3D viewer — click to add/remove members from the active instance */}
          <div style={{ borderTop: '1px solid var(--color-line-2)', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 4, left: 6, zIndex: 1,
              fontSize: 10, color: 'var(--color-text2)',
              background: 'var(--color-panel)', padding: '1px 6px',
              border: '1px solid var(--color-border)', borderRadius: 2,
              pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {activeInstance ? (
                <>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: INSTANCE_COLORS[instances.indexOf(activeInstance) % INSTANCE_COLORS.length],
                  }} />
                  Click to add/remove from {activeInstance.label} · {activeInstance.memberIds.length} selected
                </>
              ) : (
                'Select an instance row above, then click members here'
              )}
            </div>
            <FrameViewer3D
              projectId={projectId}
              nodes={allNodes as NodeLite[]}
              members={allMemberRows as MemberLite[]}
              assignments={{}}
              selectedMemberIds={activeSelectedSet}
              memberColors={memberColorMap}
              onMemberToggle={handleMemberToggle}
              dimmedMemberIds={dimmedIds.size > 0 ? dimmedIds : undefined}
            />
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
