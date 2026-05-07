'use client'

import { useMemo, useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { LoadAssembly, LoadAssemblyCategory, LoadAssemblyCategoryGroup } from '@/lib/engineering/codes'

import { Icon } from '@/components/ui/Icon'
import { generateLoadCaseBlock, staadLoadType } from '@/lib/staad/syntax'
import type { CodeStandard } from '@/lib/supabase/types'

type MemberLite = { member_id: number; section_name: string; length_mm: number; member_type: string }

/**
 * Embeddable load assembly picker — goes INSIDE a load case card.
 * Filters assemblies by the allowed categories for that card.
 *
 * For SDL: shows wall, slab, floor_finish, partition, facade assemblies
 * For Live: shows live load assemblies
 * For Roof Live: shows roof live assemblies
 * For any: shows all categories
 *
 * The user can add multiple assemblies (like a floor load = slab + tiles +
 * ceiling + MEP + partitions) and they stack up as a combined UDL.
 */
export function EmbeddedAssemblyPicker({
  codeStandard,
  members,
  caseNumber,
  caseTitle,
  loadType,
  allowedCategories,
}: {
  codeStandard: CodeStandard
  members: MemberLite[]
  caseNumber: number
  caseTitle: string
  loadType: 'dead' | 'live'
  allowedCategories: LoadAssemblyCategory[]
}) {
  const code = getCode(codeStandard)
  const filteredGroups = useMemo(
    () => code.load_assemblies.filter(g => allowedCategories.includes(g.category)),
    [code.load_assemblies, allowedCategories],
  )

  const [open, setOpen] = useState(false)
  const [addedItems, setAddedItems] = useState<{ assembly: LoadAssembly; height: number; tribWidth: number }[]>([])
  const [selectedMembers, setSelectedMembers] = useState<number[]>([])
  const [toast, setToast] = useState<string | null>(null)

  // Total UDL = sum of all added items (each computed per its dimensions)
  const computeItemLoad = (item: { assembly: LoadAssembly; height: number; tribWidth: number }) => {
    if (item.assembly.requires_height) return item.assembly.unit_weight_kpa * item.height
    if (item.assembly.requires_trib_width) return item.assembly.unit_weight_kpa * item.tribWidth
    return item.assembly.unit_weight_kpa
  }

  const totalLoad = addedItems.reduce((s, it) => s + computeItemLoad(it), 0)

  const memberLoads = selectedMembers.map(mid => ({
    memberId: mid,
    type: 'UNI' as const,
    dir: 'GY' as const,
    w: totalLoad,
  }))

  const staadCode = generateLoadCaseBlock({
    caseNumber,
    loadType: staadLoadType(loadType),
    title: caseTitle,
    memberLoads: selectedMembers.length > 0 ? memberLoads : undefined,
  })

  const addAssembly = (a: LoadAssembly) => {
    setAddedItems(prev => [...prev, { assembly: a, height: 3.0, tribWidth: 3.0 }])
  }

  const removeItem = (idx: number) => {
    setAddedItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: 'height' | 'tribWidth', val: number) => {
    setAddedItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }

  const toggleMember = (mid: number) => {
    setSelectedMembers(prev => prev.includes(mid) ? prev.filter(x => x !== mid) : [...prev, mid])
  }

  const copy = () => {
    navigator.clipboard.writeText(staadCode).catch(() => {})
    setToast('Copied!')
    setTimeout(() => setToast(null), 2000)
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-line-2)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '6px 10px', background: 'var(--color-bg)', border: 0,
          cursor: 'pointer', fontSize: 10.5, color: 'var(--color-ink-2)',
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}
      >
        <Icon name={open ? 'chevDown' : 'chevR'} size={10} />
        Add loads from assembly library
        {addedItems.length > 0 && (
          <span className="mono" style={{ fontWeight: 400, color: 'var(--color-pass)' }}>
            · {addedItems.length} item{addedItems.length > 1 ? 's' : ''} · total {totalLoad.toFixed(2)} kN/m
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Assembly browser — compact grouped dropdown */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {filteredGroups.map(g => (
              <div key={g.category} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="sub-label">{g.label}</span>
                {g.assemblies.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => addAssembly(a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', fontSize: 10.5, border: '1px solid var(--color-line)',
                      borderRadius: 3, background: '#fff', cursor: 'pointer',
                      color: 'var(--color-ink-2)', textAlign: 'left',
                    }}
                  >
                    <Icon name="plus" size={10} />
                    <span>{a.name}</span>
                    <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 9.5, marginLeft: 'auto' }}>
                      {a.unit_weight_kpa.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Added items stack */}
          {addedItems.length > 0 && (
            <div className="card" style={{ borderRadius: 4 }}>
              <table className="t" style={{ fontSize: 10.5 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Assembly</th>
                    <th className="num" style={{ width: 70, textAlign: 'right' }}>kN/m²</th>
                    <th style={{ width: 100 }}>Dimension</th>
                    <th className="num" style={{ width: 80, textAlign: 'right' }}>kN/m</th>
                    <th style={{ width: 60, textAlign: 'right' }}>Code</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {addedItems.map((it, i) => {
                    const load = computeItemLoad(it)
                    return (
                      <tr key={i}>
                        <td className="num">{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{it.assembly.name}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{it.assembly.unit_weight_kpa.toFixed(2)}</td>
                        <td>
                          {it.assembly.requires_height && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                              h=
                              <input className="input" type="number" value={it.height} onChange={e => updateItem(i, 'height', Number(e.target.value))} style={{ width: 45, height: 18, fontSize: 10 }} step="0.1" />
                              m
                            </label>
                          )}
                          {it.assembly.requires_trib_width && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                              w=
                              <input className="input" type="number" value={it.tribWidth} onChange={e => updateItem(i, 'tribWidth', Number(e.target.value))} style={{ width: 45, height: 18, fontSize: 10 }} step="0.1" />
                              m
                            </label>
                          )}
                          {!it.assembly.requires_height && !it.assembly.requires_trib_width && (
                            <span style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>—</span>
                          )}
                        </td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{load.toFixed(2)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontSize: 9, color: 'var(--color-ink-4)' }}>{it.assembly.code_clause.split('§')[1] ?? it.assembly.code_clause}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" onClick={() => removeItem(i)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 12, padding: 0 }}>×</button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'var(--color-header)', fontWeight: 600 }}>
                    <td colSpan={4}>Total UDL on selected members</td>
                    <td className="num" style={{ textAlign: 'right', fontSize: 12 }}>{totalLoad.toFixed(2)} kN/m</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Member selector */}
          {addedItems.length > 0 && members.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="sub-label">Apply to members ({selectedMembers.length} selected)</span>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {members.map(m => {
                  const sel = selectedMembers.includes(m.member_id)
                  return (
                    <button
                      key={m.member_id}
                      type="button"
                      onClick={() => toggleMember(m.member_id)}
                      style={{
                        padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)',
                        borderRadius: 3, cursor: 'pointer',
                        border: '1px solid ' + (sel ? 'var(--color-ink)' : 'var(--color-line)'),
                        background: sel ? 'var(--color-ink)' : '#fff',
                        color: sel ? '#fff' : 'var(--color-ink-3)',
                      }}
                    >
                      {m.member_id}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* STAAD code preview */}
          {addedItems.length > 0 && (
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  margin: 0, padding: '8px 10px',
                  fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5,
                  color: 'var(--color-ink)', background: '#FAFAF7',
                  border: '1px solid var(--color-line)', borderRadius: 4,
                  whiteSpace: 'pre', overflow: 'auto', maxHeight: 150,
                }}
              >
                {staadCode}
              </pre>
              <button type="button" className="btn sm" onClick={copy} style={{ position: 'absolute', top: 4, right: 4 }}>
                <Icon name="download" size={10} /> Copy
              </button>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="sync" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', maxWidth: 280 }}>
          <span className="led" /><span style={{ fontSize: 11.5 }}>{toast}</span>
        </div>
      )}
    </div>
  )
}
