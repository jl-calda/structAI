'use client'

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * Step 1b — Member Definition & Loads for beams.
 *
 * Concept: a design like B-1 may exist as multiple physical beams in STAAD.
 * Each "instance" is a set of STAAD member IDs (composing one beam span).
 * Forces are extracted per-instance from STAAD envelope; the governing
 * envelope across all instances drives the design.
 *
 * Also supports manual load input when STAAD data is unavailable.
 */

type MemberInfo = { member_id: number; section_name: string; length_mm: number; member_type: string }
type PerMemberForce = { member_id: number; mpos: number; mneg: number; vu: number }
type EnvelopeData = { mpos_max: number; mneg_max: number; vu_max: number; mpos_combo: number | null; mneg_combo: number | null; vu_combo: number | null }

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
  const [mode, setMode] = useState<'staad' | 'manual'>(initialMemberIds.length > 0 ? 'staad' : 'manual')

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

  // Manual load state
  const [manualMpos, setManualMpos] = useState(0)
  const [manualMneg, setManualMneg] = useState(0)
  const [manualVu, setManualVu] = useState(0)
  const [manualSpan, setManualSpan] = useState(6000)

  // Available STAAD beam members for picking
  const beamMembers = allMembers.filter(m => m.member_type === 'beam' || m.member_type === 'BEAM')

  const fetchForces = useCallback(async (inst: InstanceData) => {
    if (inst.memberIds.length === 0) return
    setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, loading: true } : i))
    try {
      const res = await fetch(`/api/design/member-forces?projectId=${projectId}&memberIds=${inst.memberIds.join(',')}`)
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

  // Fetch forces for initial instance
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

  const refreshInstance = (inst: InstanceData) => {
    fetchForces(inst)
  }

  // Governing envelope across all instances
  const governing = instances.reduce((gov, inst) => {
    if (!inst.forces) return gov
    return {
      mpos: Math.max(gov.mpos, inst.forces.mpos),
      mneg: Math.max(gov.mneg, inst.forces.mneg),
      vu: Math.max(gov.vu, inst.forces.vu),
    }
  }, { mpos: 0, mneg: 0, vu: 0 })

  const effectiveForces = mode === 'manual'
    ? { mpos: manualMpos, mneg: manualMneg, vu: manualVu }
    : governing

  return (
    <div className="card">
      <div className="card-h">
        <span className="num-badge">1b</span>
        <span className="label">Member Definition &amp; Loads</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          {mode === 'staad' ? `${instances.length} instance${instances.length !== 1 ? 's' : ''} · envelope across all` : 'manual input'}
        </span>
        <div className="right">
          <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg)', borderRadius: 4, padding: 2, border: '1px solid var(--color-line-2)' }}>
            <button type="button" onClick={() => setMode('staad')} style={{
              padding: '2px 10px', fontSize: 10.5, fontWeight: 600, borderRadius: 3, border: 0, cursor: 'pointer',
              background: mode === 'staad' ? 'var(--color-ink)' : 'transparent',
              color: mode === 'staad' ? '#fff' : 'var(--color-ink-3)',
            }}>STAAD</button>
            <button type="button" onClick={() => setMode('manual')} style={{
              padding: '2px 10px', fontSize: 10.5, fontWeight: 600, borderRadius: 3, border: 0, cursor: 'pointer',
              background: mode === 'manual' ? 'var(--color-ink)' : 'transparent',
              color: mode === 'manual' ? '#fff' : 'var(--color-ink-3)',
            }}>Manual</button>
          </div>
        </div>
      </div>

      {mode === 'staad' ? (
        <div>
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
            <div className="spacer" />
            {instances.length > 0 && (
              <div style={{ display: 'flex', gap: 12, fontSize: 10.5 }}>
                <span style={{ color: 'var(--color-ink-3)' }}>Governing:</span>
                <span className="mono" style={{ fontWeight: 600 }}>M⁺ = {effectiveForces.mpos.toFixed(1)} kN·m</span>
                <span className="mono" style={{ fontWeight: 600 }}>M⁻ = {effectiveForces.mneg.toFixed(1)} kN·m</span>
                <span className="mono" style={{ fontWeight: 600 }}>V = {effectiveForces.vu.toFixed(1)} kN</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Manual mode */
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <ManualField label="Span" unit="mm" value={manualSpan} onChange={setManualSpan} />
          <ManualField label="M⁺ (sagging)" unit="kN·m" value={manualMpos} onChange={setManualMpos} />
          <ManualField label="M⁻ (hogging)" unit="kN·m" value={manualMneg} onChange={setManualMneg} />
          <ManualField label="Vu (shear)" unit="kN" value={manualVu} onChange={setManualVu} />
        </div>
      )}
    </div>
  )
}

function MemberPicker({
  available,
  selected,
  onChange,
}: {
  available: MemberInfo[]
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  const [inputVal, setInputVal] = useState('')

  const addMember = (id: number) => {
    if (!selected.includes(id)) {
      onChange([...selected, id])
    }
  }

  const removeMember = (id: number) => {
    onChange(selected.filter(x => x !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const ids = inputVal.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)
      const newIds = [...new Set([...selected, ...ids])]
      onChange(newIds)
      setInputVal('')
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
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
      <input
        className="input"
        placeholder="member IDs…"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ width: 90, height: 18, fontSize: 10, padding: '0 4px' }}
      />
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
        <input
          className="input"
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          style={{ flex: 1, height: 24, fontSize: 12 }}
        />
        <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{unit}</span>
      </div>
    </div>
  )
}
