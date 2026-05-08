'use client'

import { useMemo, useState } from 'react'

import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import type { LoadAssembly, LoadAssemblyCategory } from '@/lib/engineering/codes'

import { Icon } from '@/components/ui/Icon'
import { generateLoadCaseBlock, staadLoadType, type FloorLoad } from '@/lib/staad/syntax'
import type { CodeStandard } from '@/lib/supabase/types'

type MemberLite = { member_id: number; section_name: string; length_mm: number; member_type: string }

type AssemblyItem = { assembly: LoadAssembly; height: number; tribWidth: number }

type LoadGroup = {
  id: number
  label: string
  /** 'member' = traditional MEMBER LOAD UDL; 'floor' = STAAD FLOOR LOAD command */
  mode: 'member' | 'floor'
  items: AssemblyItem[]
  memberIds: number[]
  /** For floor mode: load distribution */
  distribution: 'twoway' | 'oneway_x' | 'oneway_z'
  /** For floor mode: how to specify the floor */
  floorMethod: 'yrange' | 'members'
  /** For floor mode with yrange: Y level in metres */
  yLevel: number
}

let groupIdCounter = 1

/**
 * Embedded assembly picker with MULTIPLE load groups.
 *
 * Each group = a set of stacked assemblies applied to specific members.
 * Example: Group 1 "Wall load" → CHB 150mm (h=3m) → members 218, 219
 *          Group 2 "Floor load" → slab + tiles + ceiling → members 104, 105
 *
 * All groups combine into a single LOAD N block with multiple MEMBER LOAD lines.
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

  const [groups, setGroups] = useState<LoadGroup[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const computeItemLoad = (item: AssemblyItem) => {
    if (item.assembly.requires_height) return item.assembly.unit_weight_kpa * item.height
    if (item.assembly.requires_trib_width) return item.assembly.unit_weight_kpa * item.tribWidth
    return item.assembly.unit_weight_kpa
  }

  const itemUnit = (item: AssemblyItem) =>
    item.assembly.requires_height || item.assembly.requires_trib_width ? 'kN/m' : 'kN/m²'

  const groupTotal = (g: LoadGroup) => g.items.reduce((s, it) => s + computeItemLoad(it), 0)

  // Build MEMBER LOAD lines (for 'member' mode groups)
  const allMemberLoads = groups.filter(g => g.mode === 'member').flatMap(g => {
    const udl = groupTotal(g)
    if (udl <= 0 || g.memberIds.length === 0) return []
    return g.memberIds.map(mid => ({
      memberId: mid,
      type: 'UNI' as const,
      dir: 'GY' as const,
      w: udl,
    }))
  })

  // Build FLOOR LOAD entries (for 'floor' mode groups)
  const allFloorLoads: FloorLoad[] = groups.filter(g => g.mode === 'floor').flatMap(g => {
    const pressure = groupTotal(g)
    if (pressure <= 0) return []
    return [{
      method: g.floorMethod,
      yLevel: g.floorMethod === 'yrange' ? g.yLevel : undefined,
      memberIds: g.floorMethod === 'members' ? g.memberIds : undefined,
      pressure_kpa: pressure,
      distribution: g.distribution,
    }]
  })

  const staadCode = generateLoadCaseBlock({
    caseNumber,
    loadType: staadLoadType(loadType),
    title: caseTitle,
    memberLoads: allMemberLoads.length > 0 ? allMemberLoads : undefined,
    floorLoads: allFloorLoads.length > 0 ? allFloorLoads : undefined,
  })

  const addGroup = (label: string, mode: 'member' | 'floor' = 'member') => {
    const id = groupIdCounter++
    setGroups(prev => [...prev, {
      id, label, mode, items: [], memberIds: [],
      distribution: 'twoway', floorMethod: 'yrange', yLevel: 3.0,
    }])
  }

  const removeGroup = (id: number) => {
    setGroups(prev => prev.filter(g => g.id !== id))
  }

  const addAssemblyToGroup = (groupId: number, a: LoadAssembly) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, items: [...g.items, { assembly: a, height: 3.0, tribWidth: 3.0 }] } : g,
    ))
  }

  const removeItemFromGroup = (groupId: number, idx: number) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, items: g.items.filter((_, i) => i !== idx) } : g,
    ))
  }

  const updateItemInGroup = (groupId: number, idx: number, field: 'height' | 'tribWidth', val: number) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, items: g.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) } : g,
    ))
  }

  const toggleMemberInGroup = (groupId: number, mid: number) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, memberIds: g.memberIds.includes(mid) ? g.memberIds.filter(x => x !== mid) : [...g.memberIds, mid] } : g,
    ))
  }

  const copy = () => {
    navigator.clipboard.writeText(staadCode).catch(() => {})
    setToast('Copied!')
    setTimeout(() => setToast(null), 2000)
  }

  const addAssemblyDirect = (a: LoadAssembly) => {
    const isFloorType = a.category === 'slab' || a.category === 'floor_finish'
    const mode: 'member' | 'floor' = isFloorType ? 'floor' : 'member'
    const existing = groups.filter(g => g.mode === mode)
    if (existing.length > 0) {
      const target = existing[existing.length - 1]
      addAssemblyToGroup(target.id, a)
    } else {
      const label = isFloorType ? 'Floor load' : 'Wall load'
      addGroup(label, mode)
      setTimeout(() => {
        setGroups(prev => {
          const last = prev[prev.length - 1]
          if (!last) return prev
          return prev.map(g => g.id === last.id ? { ...g, items: [...g.items, { assembly: a, height: 3.0, tribWidth: 3.0 }] } : g)
        })
      }, 0)
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-line-2)' }}>
      {/* Assembly catalog — columns by category */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${filteredGroups.length}, 1fr)`, gap: 0, borderBottom: groups.length > 0 ? '1px solid var(--color-line-2)' : 'none' }}>
        {filteredGroups.map((fg, ci) => (
          <div key={fg.category} style={{ padding: '8px 10px', borderLeft: ci > 0 ? '1px solid var(--color-line-2)' : 'none' }}>
            <div className="sub-label" style={{ marginBottom: 6, textTransform: 'capitalize' }}>{fg.category.replace(/_/g, ' ')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {fg.assemblies.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => addAssemblyDirect(a)}
                  style={{
                    padding: '3px 8px', fontSize: 10, border: '1px solid var(--color-line)',
                    borderRadius: 3, background: '#fff', cursor: 'pointer', textAlign: 'left',
                    color: 'var(--color-ink-2)', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Icon name="plus" size={9} />
                  <span style={{ flex: 1 }}>{a.name}</span>
                  <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 9 }}>{a.unit_weight_kpa.toFixed(2)} kN/m²</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* All groups in one table with group headers */}
      {groups.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-line-2)' }}>
          <table className="t" style={{ fontSize: 10.5 }}>
            <thead>
              <tr>
                <th>#</th><th>Assembly</th>
                <th className="num" style={{ width: 70, textAlign: 'right' }}>Unit wt</th>
                <th style={{ width: 90 }}>Dim</th>
                <th className="num" style={{ width: 80, textAlign: 'right' }}>Load</th>
                <th style={{ width: 20 }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const total = groupTotal(g)
                const totalUnit = g.items.length > 0 ? itemUnit(g.items[0]) : 'kN/m²'
                return [
                  <tr key={`h-${g.id}`} style={{ background: 'var(--color-header)' }}>
                    <td colSpan={5} style={{ fontWeight: 600, fontSize: 10 }}>
                      {g.label}
                      <span className="mono" style={{ fontWeight: 400, color: 'var(--color-ink-4)', marginLeft: 8 }}>
                        {total.toFixed(2)} {totalUnit}
                      </span>
                    </td>
                    <td>
                      <button type="button" onClick={() => removeGroup(g.id)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 11, padding: 0 }}>×</button>
                    </td>
                  </tr>,
                  ...g.items.map((it, i) => {
                    const load = computeItemLoad(it)
                    return (
                      <tr key={`${g.id}-${i}`}>
                        <td className="num">{i + 1}</td>
                        <td style={{ fontSize: 10 }}>{it.assembly.name}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{it.assembly.unit_weight_kpa.toFixed(2)} <span style={{ color: 'var(--color-ink-4)', fontSize: 9 }}>kN/m²</span></td>
                        <td>
                          {it.assembly.requires_height && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                              h=<input className="input" type="number" value={it.height} onChange={e => updateItemInGroup(g.id, i, 'height', Number(e.target.value))} style={{ width: 40, height: 16, fontSize: 10 }} step="0.1" />m
                            </span>
                          )}
                          {it.assembly.requires_trib_width && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                              w=<input className="input" type="number" value={it.tribWidth} onChange={e => updateItemInGroup(g.id, i, 'tribWidth', Number(e.target.value))} style={{ width: 40, height: 16, fontSize: 10 }} step="0.1" />m
                            </span>
                          )}
                          {!it.assembly.requires_height && !it.assembly.requires_trib_width && <span style={{ fontSize: 9, color: 'var(--color-ink-4)' }}>—</span>}
                        </td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{load.toFixed(2)} <span style={{ fontWeight: 400, color: 'var(--color-ink-4)', fontSize: 9 }}>{itemUnit(it)}</span></td>
                        <td><button type="button" onClick={() => removeItemFromGroup(g.id, i)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 11, padding: 0 }}>×</button></td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
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
