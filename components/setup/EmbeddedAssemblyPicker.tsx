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

  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<LoadGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const computeItemLoad = (item: AssemblyItem) => {
    if (item.assembly.requires_height) return item.assembly.unit_weight_kpa * item.height
    if (item.assembly.requires_trib_width) return item.assembly.unit_weight_kpa * item.tribWidth
    return item.assembly.unit_weight_kpa
  }

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
    setActiveGroupId(id)
  }

  const removeGroup = (id: number) => {
    setGroups(prev => prev.filter(g => g.id !== id))
    if (activeGroupId === id) setActiveGroupId(groups.length > 1 ? groups.find(g => g.id !== id)?.id ?? null : null)
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

  const activeGroup = groups.find(g => g.id === activeGroupId)

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
        Load entries
        {groups.length > 0 && (
          <span className="mono" style={{ fontWeight: 400, color: 'var(--color-pass)' }}>
            · {groups.length} group{groups.length > 1 ? 's' : ''} · {allMemberLoads.length} member loads
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Group tabs + add buttons */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {groups.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroupId(g.id)}
                style={{
                  padding: '3px 10px', fontSize: 10.5, fontWeight: 600,
                  border: '1px solid ' + (activeGroupId === g.id ? 'var(--color-ink)' : 'var(--color-line)'),
                  borderRadius: 3, cursor: 'pointer',
                  background: activeGroupId === g.id ? 'var(--color-ink)' : '#fff',
                  color: activeGroupId === g.id ? '#fff' : 'var(--color-ink-2)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {g.label}
                <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>
                  {groupTotal(g).toFixed(1)} kN/m · {g.memberIds.length}m
                </span>
                <span
                  onClick={e => { e.stopPropagation(); removeGroup(g.id) }}
                  style={{ marginLeft: 4, cursor: 'pointer', opacity: 0.6 }}
                >×</span>
              </button>
            ))}
            <div className="divider" style={{ height: 20 }} />
            <button type="button" className="btn sm" onClick={() => addGroup('Wall load', 'member')}>
              <Icon name="plus" size={10} /> Wall load
            </button>
            <button type="button" className="btn sm" onClick={() => addGroup('Floor load', 'floor')}>
              <Icon name="plus" size={10} /> Floor load
            </button>
            <button type="button" className="btn sm" onClick={() => addGroup('Line load', 'member')}>
              <Icon name="plus" size={10} /> Line load
            </button>
          </div>

          {/* Active group editor */}
          {activeGroup && (
            <div className="card" style={{ borderRadius: 4 }}>
              <div className="card-h" style={{ minHeight: 28 }}>
                <span style={{ fontWeight: 600, fontSize: 11 }}>{activeGroup.label}</span>
                <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }}>
                  add assemblies from the library below
                </span>
              </div>

              {/* Assembly browser */}
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 120, overflow: 'auto' }}>
                {filteredGroups.map(fg => (
                  fg.assemblies.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => addAssemblyToGroup(activeGroup.id, a)}
                      style={{
                        padding: '2px 6px', fontSize: 10, border: '1px solid var(--color-line)',
                        borderRadius: 3, background: '#fff', cursor: 'pointer',
                        color: 'var(--color-ink-2)', display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}
                    >
                      <Icon name="plus" size={9} />
                      {a.name}
                      <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 9 }}>{a.unit_weight_kpa.toFixed(2)}</span>
                    </button>
                  ))
                ))}
              </div>

              {/* Added items */}
              {activeGroup.items.length > 0 && (
                <table className="t" style={{ fontSize: 10.5 }}>
                  <thead>
                    <tr>
                      <th>#</th><th>Assembly</th>
                      <th className="num" style={{ width: 60, textAlign: 'right' }}>kN/m²</th>
                      <th style={{ width: 90 }}>Dim</th>
                      <th className="num" style={{ width: 70, textAlign: 'right' }}>kN/m</th>
                      <th style={{ width: 20 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroup.items.map((it, i) => {
                      const load = computeItemLoad(it)
                      return (
                        <tr key={i}>
                          <td className="num">{i + 1}</td>
                          <td style={{ fontSize: 10 }}>{it.assembly.name}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{it.assembly.unit_weight_kpa.toFixed(2)}</td>
                          <td>
                            {it.assembly.requires_height && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                                h=<input className="input" type="number" value={it.height} onChange={e => updateItemInGroup(activeGroup.id, i, 'height', Number(e.target.value))} style={{ width: 40, height: 16, fontSize: 10 }} step="0.1" />m
                              </span>
                            )}
                            {it.assembly.requires_trib_width && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}>
                                w=<input className="input" type="number" value={it.tribWidth} onChange={e => updateItemInGroup(activeGroup.id, i, 'tribWidth', Number(e.target.value))} style={{ width: 40, height: 16, fontSize: 10 }} step="0.1" />m
                              </span>
                            )}
                            {!it.assembly.requires_height && !it.assembly.requires_trib_width && <span style={{ fontSize: 9, color: 'var(--color-ink-4)' }}>—</span>}
                          </td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{load.toFixed(2)}</td>
                          <td><button type="button" onClick={() => removeItemFromGroup(activeGroup.id, i)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--color-fail)', fontSize: 11, padding: 0 }}>×</button></td>
                        </tr>
                      )
                    })}
                    <tr style={{ background: 'var(--color-header)', fontWeight: 600 }}>
                      <td colSpan={4}>Group total UDL</td>
                      <td className="num" style={{ textAlign: 'right', fontSize: 11 }}>{groupTotal(activeGroup).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Floor load settings (distribution + method) */}
              {activeGroup.mode === 'floor' && activeGroup.items.length > 0 && (
                <div style={{ padding: '6px 8px', borderTop: '1px solid var(--color-line-2)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5 }}>
                    Distribution:
                    <select className="select" value={activeGroup.distribution} onChange={e => setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, distribution: e.target.value as 'twoway' | 'oneway_x' | 'oneway_z' } : g))} style={{ height: 22, width: 110 }}>
                      <option value="twoway">Two-way</option>
                      <option value="oneway_x">One-way X</option>
                      <option value="oneway_z">One-way Z</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5 }}>
                    Apply by:
                    <select className="select" value={activeGroup.floorMethod} onChange={e => setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, floorMethod: e.target.value as 'yrange' | 'members' } : g))} style={{ height: 22, width: 100 }}>
                      <option value="yrange">Y level</option>
                      <option value="members">Members</option>
                    </select>
                  </label>
                  {activeGroup.floorMethod === 'yrange' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5 }}>
                      Y =
                      <input className="input" type="number" value={activeGroup.yLevel} onChange={e => setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, yLevel: Number(e.target.value) } : g))} style={{ width: 60, height: 20 }} step="0.1" />
                      m
                    </label>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>
                    STAAD FLOOR LOAD — distributes {activeGroup.distribution === 'twoway' ? 'via yield-line' : `one-way in ${activeGroup.distribution.slice(-1).toUpperCase()}`} to supporting beams
                  </div>
                </div>
              )}

              {/* Member selector — for MEMBER LOAD mode or FLOOR LOAD with members method */}
              {activeGroup.items.length > 0 && members.length > 0 && (activeGroup.mode === 'member' || activeGroup.floorMethod === 'members') && (
                <div style={{ padding: '6px 8px', borderTop: '1px solid var(--color-line-2)' }}>
                  <span className="sub-label">
                    {activeGroup.mode === 'floor' ? 'Floor load members' : 'Members for this group'} ({activeGroup.memberIds.length} selected)
                  </span>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                    {members.map(m => {
                      const sel = activeGroup.memberIds.includes(m.member_id)
                      return (
                        <button key={m.member_id} type="button" onClick={() => toggleMemberInGroup(activeGroup.id, m.member_id)}
                          style={{
                            padding: '2px 5px', fontSize: 10, fontFamily: 'var(--font-mono)',
                            borderRadius: 3, cursor: 'pointer',
                            border: '1px solid ' + (sel ? 'var(--color-ink)' : 'var(--color-line)'),
                            background: sel ? 'var(--color-ink)' : '#fff',
                            color: sel ? '#fff' : 'var(--color-ink-3)',
                          }}
                        >{m.member_id}</button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Combined STAAD code preview (all groups merged) */}
          {groups.length > 0 && (
            <div style={{ position: 'relative' }}>
              <pre style={{
                margin: 0, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5,
                color: 'var(--color-ink)', background: '#FAFAF7', border: '1px solid var(--color-line)',
                borderRadius: 4, whiteSpace: 'pre', overflow: 'auto', maxHeight: 200,
              }}>
                {`; --- ${caseTitle} ---\n; Groups: ${groups.map(g => `${g.label} (${groupTotal(g).toFixed(2)} kN/m → members ${g.memberIds.join(',')||'none'})`).join(' | ')}\n`}
                {staadCode}
              </pre>
              <button type="button" className="btn sm" onClick={copy} style={{ position: 'absolute', top: 4, right: 4 }}>
                <Icon name="download" size={10} /> Copy
              </button>
            </div>
          )}

          {groups.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-ink-3)', padding: '4px 0' }}>
              Click "Wall load", "Floor load", or "Custom" above to add a load group.
              Each group can have different assemblies applied to different members.
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
