'use client'

import { useMemo, useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { LoadAssembly, LoadAssemblyCategoryGroup } from '@/lib/engineering/codes'

import { Icon } from '@/components/ui/Icon'
import { generateLoadCaseBlock, staadLoadType } from '@/lib/staad/syntax'
import type { CodeStandard } from '@/lib/supabase/types'

type MemberLite = { member_id: number; section_name: string; length_mm: number; member_type: string }

export function LoadAssemblyApplier({
  codeStandard,
  members,
}: {
  codeStandard: CodeStandard
  members: MemberLite[]
}) {
  const code = getCode(codeStandard)
  const groups = code.load_assemblies

  const [selectedCat, setSelectedCat] = useState(groups[0]?.category ?? 'wall')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [height, setHeight] = useState(3.0)
  const [tribWidth, setTribWidth] = useState(3.0)
  const [selectedMembers, setSelectedMembers] = useState<number[]>([])
  const [caseNumber, setCaseNumber] = useState(3)
  const [toast, setToast] = useState<string | null>(null)

  const activeGroup = groups.find(g => g.category === selectedCat)
  const assembly: LoadAssembly | undefined = useMemo(() => {
    if (!selectedId) return activeGroup?.assemblies[0]
    for (const g of groups) {
      const found = g.assemblies.find(a => a.id === selectedId)
      if (found) return found
    }
    return activeGroup?.assemblies[0]
  }, [selectedId, activeGroup, groups])

  if (!assembly) return null

  // Compute the final load value
  let computedLoad = assembly.unit_weight_kpa
  let loadUnit = 'kN/m²'
  if (assembly.requires_height) {
    computedLoad = assembly.unit_weight_kpa * height
    loadUnit = 'kN/m'
  } else if (assembly.requires_trib_width) {
    computedLoad = assembly.unit_weight_kpa * tribWidth
    loadUnit = 'kN/m'
  }

  const memberLoads = selectedMembers.map(mid => ({
    memberId: mid,
    type: 'UNI' as const,
    dir: 'GY' as const,
    w: computedLoad,
  }))

  const staadCode = generateLoadCaseBlock({
    caseNumber,
    loadType: staadLoadType(assembly.load_type),
    title: assembly.load_type === 'dead' ? 'DL' : 'LL',
    memberLoads: selectedMembers.length > 0 ? memberLoads : undefined,
  })

  const copy = () => {
    navigator.clipboard.writeText(staadCode).catch(() => {})
    setToast('Copied!')
    setTimeout(() => setToast(null), 2000)
  }

  const toggleMember = (mid: number) => {
    setSelectedMembers(prev =>
      prev.includes(mid) ? prev.filter(x => x !== mid) : [...prev, mid],
    )
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Load Assembly Calculator</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 11.5 }}>
          {codeStandard.replace(/_/g, ' ')} · select assembly → enter dimensions → apply to members
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
        {/* Left: category tabs + assembly list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-h">
            <span className="label">Assemblies</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Category tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--color-line-2)' }}>
              {groups.map(g => (
                <button
                  key={g.category}
                  type="button"
                  onClick={() => { setSelectedCat(g.category); setSelectedId(null) }}
                  style={{
                    padding: '2px 6px', fontSize: 9.5, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    border: 0, borderRadius: 3, cursor: 'pointer',
                    background: selectedCat === g.category ? 'var(--color-ink)' : 'transparent',
                    color: selectedCat === g.category ? '#fff' : 'var(--color-ink-3)',
                  }}
                >
                  {g.label.split(' ')[0]}
                </button>
              ))}
            </div>
            {/* Assembly list */}
            <div style={{ flex: 1, overflow: 'auto', maxHeight: 400 }}>
              {activeGroup?.assemblies.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px', border: 0, cursor: 'pointer',
                    background: assembly?.id === a.id ? 'var(--color-sel-bg)' : 'transparent',
                    borderLeft: assembly?.id === a.id ? '2px solid var(--color-sel)' : '2px solid transparent',
                    fontSize: 11.5, color: 'var(--color-ink)',
                  }}
                >
                  <div style={{ fontWeight: assembly?.id === a.id ? 600 : 400 }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-3)' }}>
                    {a.unit_weight_kpa.toFixed(2)} kN/m² · {a.code_clause}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: selected assembly details + apply */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Assembly breakdown */}
          <div className="card">
            <div className="card-h">
              <span className="num-badge">1</span>
              <span className="label">{assembly.name}</span>
              <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }}>{assembly.code_clause}</span>
            </div>
            <div className="card-b">
              <table className="t" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="num" style={{ textAlign: 'right', width: 80 }}>t (mm)</th>
                    <th className="num" style={{ textAlign: 'right', width: 80 }}>γ (kN/m³)</th>
                    <th className="num" style={{ textAlign: 'right', width: 80 }}>w (kN/m²)</th>
                  </tr>
                </thead>
                <tbody>
                  {assembly.components.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{c.thickness_mm?.toFixed(0) ?? '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{c.density_kn_m3?.toFixed(1) ?? '—'}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{c.weight_kpa.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--color-header)', fontWeight: 600 }}>
                    <td colSpan={3}>Total unit weight</td>
                    <td className="num" style={{ textAlign: 'right' }}>{assembly.unit_weight_kpa.toFixed(2)} kN/m²</td>
                  </tr>
                </tbody>
              </table>

              {/* Dimension inputs */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {assembly.requires_height && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    Wall height:
                    <input className="input" type="number" value={height} onChange={e => setHeight(Number(e.target.value))} style={{ width: 60, height: 22 }} step="0.1" />
                    <span style={{ color: 'var(--color-ink-4)' }}>m</span>
                  </label>
                )}
                {assembly.requires_trib_width && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    Tributary width:
                    <input className="input" type="number" value={tribWidth} onChange={e => setTribWidth(Number(e.target.value))} style={{ width: 60, height: 22 }} step="0.1" />
                    <span style={{ color: 'var(--color-ink-4)' }}>m</span>
                  </label>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  Case #:
                  <input className="input" type="number" value={caseNumber} onChange={e => setCaseNumber(Number(e.target.value))} style={{ width: 50, height: 22 }} />
                </label>
                <div className="result-bar pass" style={{ margin: 0, padding: '4px 12px' }}>
                  <span className="label">Computed UDL</span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
                    {computedLoad.toFixed(2)} {loadUnit}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Member selector + code preview */}
          <div className="card">
            <div className="card-h">
              <span className="num-badge">2</span>
              <span className="label">Apply to Members</span>
              <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }}>
                {selectedMembers.length} selected · or copy the code below
              </span>
            </div>
            <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.length > 0 ? (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {members.map(m => {
                    const sel = selectedMembers.includes(m.member_id)
                    return (
                      <button
                        key={m.member_id}
                        type="button"
                        onClick={() => toggleMember(m.member_id)}
                        style={{
                          padding: '3px 8px', fontSize: 10.5, fontFamily: 'var(--font-mono)',
                          borderRadius: 3, cursor: 'pointer',
                          border: '1px solid ' + (sel ? 'var(--color-ink)' : 'var(--color-line)'),
                          background: sel ? 'var(--color-ink)' : '#fff',
                          color: sel ? '#fff' : 'var(--color-ink-3)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <span>{m.member_id}</span>
                        <span style={{ fontSize: 9, opacity: 0.7 }}>{m.member_type[0].toUpperCase()}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>
                  No STAAD members synced. The load declaration below can still be copied.
                </div>
              )}

              {/* Code preview */}
              <div style={{ position: 'relative' }}>
                <pre
                  style={{
                    margin: 0, padding: '10px 12px',
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.5,
                    color: 'var(--color-ink)', background: '#FAFAF7',
                    border: '1px solid var(--color-line)', borderRadius: 4,
                    whiteSpace: 'pre', overflow: 'auto', maxHeight: 200,
                  }}
                >
                  {staadCode}
                </pre>
                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                  <button type="button" className="btn sm" onClick={copy}>
                    <Icon name="download" size={11} /> Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="sync" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 280 }}>
          <span className="led" /><span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
    </div>
  )
}
