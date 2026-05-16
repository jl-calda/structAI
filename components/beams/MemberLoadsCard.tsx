'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { FrameViewer3D, type MemberLite, type NodeLite } from '@/components/staad/FrameViewer3D'
import type { MemberRow, NodeRow } from '@/lib/data/staad'

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

type SectionForcePoint = {
  member_id: number
  combo_number: number
  x_ratio: number
  x_mm: number
  mz_knm: number
  vy_kn: number
  n_kn: number
  my_knm?: number
  vz_kn?: number
}

type InstanceData = {
  id: number
  label: string
  memberIds: number[]
  span_mm: number
  forces: { mpos: number; mneg: number; vu: number } | null
  loading: boolean
}

let instanceIdCounter = 1

const INSTANCE_COLORS = [
  '#D4820F', // amber
  '#1755A0', // blue
  '#0D9488', // teal
  '#7C3AED', // purple
  '#16A34A', // green
  '#DC2626', // red
  '#DB2777', // pink
  '#CA8A04', // yellow
]

export type BeamMemberLoadsCardProps = {
  projectId: string
  initialMemberIds: number[]
  allMembers: MemberInfo[]
  allMemberRows: MemberRow[]
  allNodes: NodeRow[]
  designLabel: string
}

export function BeamMemberLoadsCard({
  projectId,
  initialMemberIds,
  allMembers,
  allMemberRows,
  allNodes,
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

  // View tab: summary instances or raw section forces table
  const [viewTab, setViewTab] = useState<'instances' | 'forces'>('instances')
  const [forcesData, setForcesData] = useState<SectionForcePoint[] | null>(null)
  const [forcesLoading, setForcesLoading] = useState(false)

  // Live search state
  const [searchSection, setSearchSection] = useState('')
  const [searchResults, setSearchResults] = useState<MemberInfo[]>([])
  const [searching, setSearching] = useState(false)

  const beamMembers = allMembers.filter(m => m.member_type === 'beam' || m.member_type === 'BEAM')

  const [activeInstanceId, setActiveInstanceId] = useState<number | null>(
    () => instances.length > 0 ? instances[0].id : null,
  )

  const beamMemberIds = useMemo(
    () => new Set(beamMembers.map(m => m.member_id)),
    [beamMembers],
  )
  const dimmedIds = useMemo(() => {
    const s = new Set<number>()
    for (const m of allMemberRows) {
      if (!beamMemberIds.has(m.member_id)) s.add(m.member_id)
    }
    return s
  }, [allMemberRows, beamMemberIds])

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
    if (!beamMemberIds.has(memberId)) return
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
    const newId = instanceIdCounter++
    setInstances(prev => [...prev, {
      id: newId,
      label: `${designLabel}-${n}`,
      memberIds: [],
      span_mm: 0,
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

  // Fetch section-force points for all member IDs across all instances
  const fetchSectionForces = useCallback(async () => {
    const allIds = [...new Set(instances.flatMap(i => i.memberIds))]
    if (allIds.length === 0) {
      setForcesData([])
      return
    }
    setForcesLoading(true)
    try {
      const comboParam = comboQueryStr ? `&combos=${comboQueryStr}` : ''
      const res = await fetch(`/api/design/section-forces?projectId=${projectId}&memberIds=${allIds.join(',')}${comboParam}`)
      const json = await res.json()
      if (json.ok) setForcesData(json.data.points)
      else setForcesData([])
    } catch {
      setForcesData([])
    }
    setForcesLoading(false)
  }, [projectId, instances, comboQueryStr])

  // Fetch when switching to forces tab
  useEffect(() => {
    if (viewTab === 'forces' && forcesData === null) {
      fetchSectionForces()
    }
  }, [viewTab, forcesData, fetchSectionForces])

  // Reset forces data when combos or instances change so it re-fetches
  useEffect(() => {
    setForcesData(null)
  }, [comboQueryStr, instances])

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

      {/* View tabs — only shown for cached/live modes */}
      {mode !== 'manual' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
          {[
            { k: 'instances', n: 'Instances · summary' },
            { k: 'forces', n: 'Section forces · raw points' },
          ].map(t => (
            <button key={t.k} type="button" onClick={() => setViewTab(t.k as typeof viewTab)}
              style={{
                padding: '6px 14px', fontSize: 10.5, fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                background: viewTab === t.k ? 'var(--color-panel)' : 'transparent',
                border: 0, borderRight: '1px solid var(--color-line-2)',
                borderBottom: viewTab === t.k ? '2px solid var(--color-ink)' : '2px solid transparent',
                cursor: 'pointer',
                color: viewTab === t.k ? 'var(--color-ink)' : 'var(--color-ink-3)',
              }}>
              {t.n}
            </button>
          ))}
        </div>
      )}

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

          {viewTab === 'forces' ? (
            <SectionForcesTable
              points={forcesData}
              loading={forcesLoading}
              onRefresh={fetchSectionForces}
              members={beamMembers}
            />
          ) : (
          <>
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
                <th style={{ width: 24 }}></th>
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
                      <button type="button" onClick={e => { e.stopPropagation(); refreshInstance(inst) }} title="Refresh forces"
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
                <span className="mono" style={{ fontWeight: 600 }}>M⁺ = {governing.mpos.toFixed(1)} kN·m</span>
                <span className="mono" style={{ fontWeight: 600 }}>M⁻ = {governing.mneg.toFixed(1)} kN·m</span>
                <span className="mono" style={{ fontWeight: 600 }}>V = {governing.vu.toFixed(1)} kN</span>
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
          </>
          )}
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

/**
 * Section forces table — raw 11-point M(x), V(x), N(x) samples per member per combo.
 * Displays the data the design engine actually reads from staad_diagram_points,
 * so the user can verify what STAAD synced.
 */
function SectionForcesTable({
  points,
  loading,
  onRefresh,
  members,
}: {
  points: SectionForcePoint[] | null
  loading: boolean
  onRefresh: () => void
  members: MemberInfo[]
}) {
  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-ink-4)', fontSize: 11 }}>
        Loading section forces…
      </div>
    )
  }
  if (!points || points.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-ink-4)', fontSize: 11 }}>
        No section forces in cache for the selected members + combos.
        <br />
        Run analysis in STAAD and re-sync, or check that combo numbers match.
        <br />
        <button type="button" onClick={onRefresh} className="btn sm" style={{ marginTop: 8 }}>
          <Icon name="sync" size={10} /> Retry
        </button>
      </div>
    )
  }

  // Group by member + combo for compact display
  const byMember = new Map<number, Map<number, SectionForcePoint[]>>()
  for (const p of points) {
    if (!byMember.has(p.member_id)) byMember.set(p.member_id, new Map())
    const byCombo = byMember.get(p.member_id)!
    if (!byCombo.has(p.combo_number)) byCombo.set(p.combo_number, [])
    byCombo.get(p.combo_number)!.push(p)
  }

  return (
    <div style={{ maxHeight: 480, overflow: 'auto' }}>
      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-line-2)' }}>
        <span style={{ fontSize: 10, color: 'var(--color-ink-3)' }}>
          {points.length.toLocaleString()} samples · {byMember.size} members · {[...new Set(points.map(p => p.combo_number))].length} combos
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onRefresh} className="btn sm ghost" style={{ height: 20, fontSize: 10 }}>
          <Icon name="sync" size={9} /> Refresh
        </button>
      </div>
      <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)', zIndex: 1 }}>
          <tr>
            <th style={{ width: 70 }}>Member</th>
            <th style={{ width: 60 }}>Combo</th>
            <th className="num" style={{ width: 60, textAlign: 'right' }}>x/L</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>x (mm)</th>
            <th className="num" style={{ width: 100, textAlign: 'right' }}>Mz (kN·m)</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>Vy (kN)</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>N (kN)</th>
            <th className="num" style={{ width: 90, textAlign: 'right' }}>My (kN·m)</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>Vz (kN)</th>
          </tr>
        </thead>
        <tbody>
          {[...byMember.entries()].flatMap(([mid, byCombo]) => {
            const memberInfo = members.find(m => m.member_id === mid)
            return [...byCombo.entries()].flatMap(([combo, pts]) => (
              pts.map((p, i) => (
                <tr key={`${mid}-${combo}-${i}`} style={{
                  background: i === 0 ? 'var(--color-bg)' : 'transparent',
                }}>
                  <td>
                    {i === 0 && (
                      <span>
                        <span style={{ fontWeight: 600 }}>{mid}</span>
                        {memberInfo && <span style={{ color: 'var(--color-ink-4)', fontSize: 9, marginLeft: 4 }}>{memberInfo.section_name}</span>}
                      </span>
                    )}
                  </td>
                  <td>{i === 0 && <span style={{ fontWeight: 600 }}>{combo}</span>}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.x_ratio.toFixed(2)}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-3)' }}>{p.x_mm.toFixed(0)}</td>
                  <td className="num" style={{ textAlign: 'right', color: p.mz_knm > 0 ? 'var(--color-ink)' : p.mz_knm < 0 ? 'var(--color-fail)' : 'var(--color-ink-4)', fontWeight: Math.abs(p.mz_knm) > 0.01 ? 600 : 400 }}>
                    {p.mz_knm.toFixed(2)}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.vy_kn.toFixed(2)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.n_kn.toFixed(2)}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-4)' }}>{p.my_knm != null ? p.my_knm.toFixed(2) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-4)' }}>{p.vz_kn != null ? p.vz_kn.toFixed(2) : '—'}</td>
                </tr>
              ))
            ))
          })}
        </tbody>
      </table>
    </div>
  )
}
