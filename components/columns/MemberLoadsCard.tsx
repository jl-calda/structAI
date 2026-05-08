'use client'

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * Step 1b — Member Definition & Loads for columns.
 *
 * A column design (e.g. C-1) may exist as multiple physical columns in STAAD.
 * Each "instance" is a STAAD member ID. Forces (Pu, Mu, Vu) are extracted
 * per-instance from STAAD envelope; the governing values drive the design.
 *
 * Also supports manual load input when STAAD data is unavailable.
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
  const [mode, setMode] = useState<'staad' | 'manual'>(initialMemberIds.length > 0 ? 'staad' : 'manual')

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

  const columnMembers = allMembers.filter(m =>
    m.member_type === 'column' || m.member_type === 'COLUMN',
  )

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
          height_mm: d.totalSpan,
          forces: {
            pu: d.envelope.nu_comp_max,
            mu_major: d.envelope.mpos_max,
            mu_minor: d.envelope.mpos_minor_max ?? 0,
            vu: d.envelope.vu_max,
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

  const refreshInstance = (inst: InstanceData) => {
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
          {mode === 'staad' ? `${instances.length} instance${instances.length !== 1 ? 's' : ''} · governing envelope` : 'manual input'}
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
                    <MemberPicker
                      available={columnMembers}
                      selected={inst.memberIds}
                      onChange={ids => updateMemberIds(inst.id, ids)}
                    />
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    <span className="mono">{inst.height_mm > 0 ? inst.height_mm.toFixed(0) : '—'}</span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {inst.loading ? <span style={{ color: 'var(--color-ink-4)', fontSize: 10 }}>…</span> :
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
      ) : (
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <ManualField label="Height" unit="mm" value={manualHeight} onChange={setManualHeight} />
          <ManualField label="Pu (axial)" unit="kN" value={manualPu} onChange={setManualPu} />
          <ManualField label="Mu,x (major)" unit="kN·m" value={manualMuMajor} onChange={setManualMuMajor} />
          <ManualField label="Mu,y (minor)" unit="kN·m" value={manualMuMinor} onChange={setManualMuMinor} />
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
        <input className="input" type="number" value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          style={{ flex: 1, height: 24, fontSize: 12 }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{unit}</span>
      </div>
    </div>
  )
}
