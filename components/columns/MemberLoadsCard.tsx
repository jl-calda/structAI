'use client'

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

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

export type ColumnMemberLoadsCardProps = {
  projectId: string
  initialMemberIds: number[]
  allMembers: MemberInfo[]
  designLabel: string
}

export function ColumnMemberLoadsCard({
  projectId,
  initialMemberIds,
  allMembers,
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

  const [searchSection, setSearchSection] = useState('')
  const [searchResults, setSearchResults] = useState<MemberInfo[]>([])
  const [searching, setSearching] = useState(false)

  const columnMembers = allMembers.filter(m => m.member_type === 'column' || m.member_type === 'COLUMN')

  useEffect(() => {
    fetch('/api/bridge/status')
      .then(r => r.json())
      .then(d => setBridgeOnline(d.connected === true))
      .catch(() => setBridgeOnline(false))
  }, [])

  const fetchForcesCached = useCallback(async (inst: InstanceData) => {
    if (inst.memberIds.length === 0) return
    setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: true } : i))
    try {
      const res = await fetch(`/api/design/member-forces?projectId=${projectId}&memberIds=${inst.memberIds.join(',')}`)
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
    setInstances(prev => [...prev, {
      id: instanceIdCounter++,
      label: `${designLabel}-${n}`,
      memberIds: [],
      height_mm: 0,
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
              {instances.map(inst => (
                <tr key={inst.id}>
                  <td>
                    <input className="input" value={inst.label} style={{ width: 80, height: 20, fontSize: 10.5 }}
                      onChange={e => setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, label: e.target.value } : i))} />
                  </td>
                  <td>
                    <MemberPicker available={columnMembers} selected={inst.memberIds}
                      onChange={ids => updateMemberIds(inst.id, ids)} />
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
                      <button type="button" onClick={() => refreshInstance(inst)} title="Refresh"
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
                <span className="mono" style={{ fontWeight: 600 }}>Pu = {governing.pu.toFixed(1)} kN</span>
                <span className="mono" style={{ fontWeight: 600 }}>Mu,x = {governing.mu_major.toFixed(1)}</span>
                <span className="mono" style={{ fontWeight: 600 }}>Mu,y = {governing.mu_minor.toFixed(1)}</span>
                <span className="mono" style={{ fontWeight: 600 }}>Vu = {governing.vu.toFixed(1)} kN</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MemberPicker({ available, selected, onChange }: {
  available: MemberInfo[]; selected: number[]; onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [inputVal, setInputVal] = useState('')

  const removeMember = (id: number) => onChange(selected.filter(x => x !== id))
  const toggleMember = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputVal.trim()) {
      const ids = inputVal.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)
      onChange([...new Set([...selected, ...ids])])
      setInputVal('')
    }
  }

  const filtered = filter
    ? available.filter(m => m.member_id.toString().includes(filter) || m.section_name.toLowerCase().includes(filter.toLowerCase()))
    : available
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
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 10, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        )
      })}
      <button type="button" onClick={() => setOpen(!open)}
        className="btn sm" style={{ height: 18, fontSize: 9.5, padding: '0 6px' }}>
        <Icon name="plus" size={8} /> Choose members
      </button>
      <input className="input" placeholder="or type IDs…" value={inputVal}
        onChange={e => setInputVal(e.target.value)} onKeyDown={handleKeyDown}
        style={{ width: 80, height: 18, fontSize: 10, padding: '0 4px' }} />

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 20,
          width: 420, maxHeight: 280, overflow: 'hidden',
          background: 'var(--color-panel)', border: '1px solid var(--color-line)',
          borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="search" size={10} />
            <input className="input" placeholder="Filter by ID or section…" value={filter}
              onChange={e => setFilter(e.target.value)} autoFocus
              style={{ flex: 1, height: 22, fontSize: 11 }} />
            <span className="mono" style={{ fontSize: 9, color: 'var(--color-ink-4)' }}>{selected.length} sel</span>
            <button type="button" onClick={() => setOpen(false)}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-ink-3)', fontSize: 14 }}>×</button>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {sections.length === 0 ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--color-ink-4)' }}>No members found</div>
            ) : sections.map(sec => {
              const membersInSec = filtered.filter(m => m.section_name === sec)
              const allSelected = membersInSec.every(m => selected.includes(m.member_id))
              const someSelected = membersInSec.some(m => selected.includes(m.member_id))
              const toggleSection = () => {
                const secIds = membersInSec.map(m => m.member_id)
                if (allSelected) onChange(selected.filter(id => !secIds.includes(id)))
                else onChange([...new Set([...selected, ...secIds])])
              }
              return (
                <div key={sec}>
                  <div onClick={toggleSection} style={{
                    padding: '4px 8px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-line-2)',
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10.5,
                    fontWeight: 600, color: 'var(--color-ink-2)',
                  }}>
                    <input type="checkbox" checked={allSelected} readOnly style={{ pointerEvents: 'none' }}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }} />
                    <span>{sec}</span>
                    <span className="mono" style={{ color: 'var(--color-ink-4)', fontWeight: 400, fontSize: 9 }}>{membersInSec.length} members</span>
                  </div>
                  {membersInSec.map(m => (
                    <label key={m.member_id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 20px',
                      cursor: 'pointer', fontSize: 10.5,
                      background: selected.includes(m.member_id) ? 'var(--color-sel-bg, #E8F0FA)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={selected.includes(m.member_id)} onChange={() => toggleMember(m.member_id)} />
                      <span className="mono" style={{ width: 36, fontWeight: 600 }}>{m.member_id}</span>
                      <span style={{ color: 'var(--color-ink-3)', flex: 1 }}>{m.section_name}</span>
                      <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 9 }}>{m.length_mm} mm</span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
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
