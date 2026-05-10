'use client'

import { useState } from 'react'

import type {
  CombinationRow,
  DeflectionRow,
  DiagramPointRow,
  DisplacementRow,
  EndForceRow,
  EnvelopeRow,
  LoadCaseRow,
  MaterialRow,
  MemberRow,
  NodeRow,
  ReactionRow,
  SectionRow,
} from '@/lib/data/staad'

type Tab = 'nodes' | 'members' | 'sections' | 'materials' | 'load_cases' | 'combos' | 'envelope' | 'reactions' | 'forces' | 'displacements' | 'end_forces' | 'deflections'

export function StaadDataView({
  nodes,
  members,
  sections,
  materials,
  loadCases,
  combinations,
  envelope,
  reactions,
  displacements,
  diagramPoints,
  endForces,
  deflections,
}: {
  nodes: NodeRow[]
  members: MemberRow[]
  sections: SectionRow[]
  materials: MaterialRow[]
  loadCases: LoadCaseRow[]
  combinations: CombinationRow[]
  envelope: EnvelopeRow[]
  reactions: ReactionRow[]
  displacements: DisplacementRow[]
  diagramPoints: DiagramPointRow[]
  endForces: EndForceRow[]
  deflections: DeflectionRow[]
}) {
  const [tab, setTab] = useState<Tab>('members')

  const tabs: { k: Tab; n: string; count: number }[] = [
    { k: 'nodes', n: 'Nodes', count: nodes.length },
    { k: 'members', n: 'Members', count: members.length },
    { k: 'sections', n: 'Sections', count: sections.length },
    { k: 'materials', n: 'Materials', count: materials.length },
    { k: 'load_cases', n: 'Load Cases', count: loadCases.length },
    { k: 'combos', n: 'Combinations', count: combinations.length },
    { k: 'envelope', n: 'Envelope (peaks)', count: envelope.length },
    { k: 'forces', n: 'Section Forces', count: diagramPoints.length },
    { k: 'end_forces', n: 'End Forces', count: endForces.length },
    { k: 'reactions', n: 'Reactions', count: reactions.length },
    { k: 'displacements', n: 'Displacements', count: displacements.length },
    { k: 'deflections', n: 'Beam Deflections', count: deflections.length },
  ]

  return (
    <div className="card">
      <div className="card-h" style={{ padding: 0, borderBottom: '1px solid var(--color-line-2)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: '100%' }}>
          {tabs.map(t => (
            <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{
              padding: '8px 14px', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              background: tab === t.k ? 'var(--color-panel)' : 'var(--color-bg)',
              border: 0, borderRight: '1px solid var(--color-line-2)',
              borderBottom: tab === t.k ? '2px solid var(--color-ink)' : '2px solid transparent',
              cursor: 'pointer',
              color: tab === t.k ? 'var(--color-ink)' : 'var(--color-ink-3)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.n}
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)', fontWeight: 400 }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxHeight: 600, overflow: 'auto' }}>
        {tab === 'nodes' && <NodesTable rows={nodes} />}
        {tab === 'members' && <MembersTable rows={members} />}
        {tab === 'sections' && <SectionsTable rows={sections} />}
        {tab === 'materials' && <MaterialsTable rows={materials} />}
        {tab === 'load_cases' && <LoadCasesTable rows={loadCases} />}
        {tab === 'combos' && <CombosTable rows={combinations} />}
        {tab === 'envelope' && <EnvelopeTable rows={envelope} />}
        {tab === 'forces' && <DiagramPointsTable rows={diagramPoints} members={members} />}
        {tab === 'end_forces' && <EndForcesTable rows={endForces} members={members} />}
        {tab === 'reactions' && <ReactionsTable rows={reactions} />}
        {tab === 'displacements' && <DisplacementsTable rows={displacements} />}
        {tab === 'deflections' && <DeflectionsTable rows={deflections} members={members} />}
      </div>
    </div>
  )
}

function Empty({ what }: { what: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-ink-4)', fontSize: 11.5 }}>
      No {what} in cache. Sync STAAD model first.
    </div>
  )
}

function NodesTable({ rows }: { rows: NodeRow[] }) {
  if (rows.length === 0) return <Empty what="nodes" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>Node</th>
          <th className="num" style={{ textAlign: 'right' }}>X (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>Y (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>Z (mm)</th>
          <th>Support</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.node_id}>
            <td style={{ fontWeight: 600 }}>{r.node_id}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.x_mm.toFixed(0)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.y_mm.toFixed(0)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.z_mm.toFixed(0)}</td>
            <td>{r.support_type ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MembersTable({ rows }: { rows: MemberRow[] }) {
  if (rows.length === 0) return <Empty what="members" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>Member</th>
          <th className="num" style={{ width: 60, textAlign: 'right' }}>Start</th>
          <th className="num" style={{ width: 60, textAlign: 'right' }}>End</th>
          <th>Section</th>
          <th className="num" style={{ textAlign: 'right' }}>Length</th>
          <th className="num" style={{ width: 50, textAlign: 'right' }}>β°</th>
          <th>Type</th>
          <th>Release-i</th>
          <th>Release-j</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.member_id}>
            <td style={{ fontWeight: 600 }}>{r.member_id}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.start_node_id}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.end_node_id}</td>
            <td>{r.section_name}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.length_mm.toFixed(0)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.beta_angle_deg.toFixed(1)}</td>
            <td style={{ color: 'var(--color-ink-3)' }}>{r.member_type}</td>
            <td style={{ color: 'var(--color-ink-3)', fontSize: 9 }}>{formatRelease(r.release_start)}</td>
            <td style={{ color: 'var(--color-ink-3)', fontSize: 9 }}>{formatRelease(r.release_end)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatRelease(rel: MemberRow['release_start']): string {
  if (!rel || typeof rel !== 'object') return '—'
  const r = rel as Record<string, boolean>
  const released = (['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const).filter(k => r[k])
  if (released.length === 0) return 'fixed'
  if (released.length === 3 && released.every(k => k.startsWith('m'))) return 'pinned'
  return released.join('+').toUpperCase()
}

function SectionsTable({ rows }: { rows: SectionRow[] }) {
  if (rows.length === 0) return <Empty what="sections" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th className="num" style={{ textAlign: 'right' }}>b (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>h (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>A (mm²)</th>
          <th className="num" style={{ textAlign: 'right' }}>Imaj (mm⁴)</th>
          <th className="num" style={{ textAlign: 'right' }}>Imin (mm⁴)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.section_name}>
            <td style={{ fontWeight: 600 }}>{r.section_name}</td>
            <td>{r.section_type ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.b_mm?.toFixed(0) ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.h_mm?.toFixed(0) ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.area_mm2?.toFixed(0) ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.i_major_mm4 != null ? `${(r.i_major_mm4 / 1e6).toFixed(2)}·10⁶` : '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.i_minor_mm4 != null ? `${(r.i_minor_mm4 / 1e6).toFixed(2)}·10⁶` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MaterialsTable({ rows }: { rows: MaterialRow[] }) {
  if (rows.length === 0) return <Empty what="materials" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th>Name</th>
          <th className="num" style={{ textAlign: 'right' }}>E (MPa)</th>
          <th className="num" style={{ textAlign: 'right' }}>γ (kN/m³)</th>
          <th className="num" style={{ textAlign: 'right' }}>fc (MPa)</th>
          <th className="num" style={{ textAlign: 'right' }}>fy (MPa)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name}>
            <td style={{ fontWeight: 600 }}>{r.name}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.e_mpa?.toFixed(0) ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.density_kn_m3?.toFixed(1) ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.fc_mpa?.toFixed(1) ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.fy_mpa?.toFixed(1) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function LoadCasesTable({ rows }: { rows: LoadCaseRow[] }) {
  if (rows.length === 0) return <Empty what="load cases" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>LC</th>
          <th>Title</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.case_number}>
            <td style={{ fontWeight: 600 }}>{r.case_number}</td>
            <td>{r.title}</td>
            <td style={{ color: 'var(--color-ink-3)' }}>{r.load_type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CombosTable({ rows }: { rows: CombinationRow[] }) {
  if (rows.length === 0) return <Empty what="combinations" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 70 }}>Combo</th>
          <th>Title</th>
          <th>Factors</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.combo_number}>
            <td style={{ fontWeight: 600 }}>{r.combo_number}</td>
            <td>{r.title}</td>
            <td style={{ color: 'var(--color-ink-3)', fontSize: 10 }}>
              {Array.isArray(r.factors)
                ? (r.factors as Array<{ case_number: number; factor: number }>)
                  .map(f => `${f.case_number}×${f.factor}`).join(' + ')
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EnvelopeTable({ rows }: { rows: EnvelopeRow[] }) {
  if (rows.length === 0) return <Empty what="envelope data" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>Member</th>
          <th className="num" style={{ textAlign: 'right' }}>M⁺ (kN·m)</th>
          <th className="num" style={{ textAlign: 'right' }}>combo</th>
          <th className="num" style={{ textAlign: 'right' }}>M⁻ (kN·m)</th>
          <th className="num" style={{ textAlign: 'right' }}>combo</th>
          <th className="num" style={{ textAlign: 'right' }}>Vu (kN)</th>
          <th className="num" style={{ textAlign: 'right' }}>combo</th>
          <th className="num" style={{ textAlign: 'right' }}>Nc (kN)</th>
          <th className="num" style={{ textAlign: 'right' }}>Nt (kN)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.member_id}>
            <td style={{ fontWeight: 600 }}>{r.member_id}</td>
            <td className="num" style={{ textAlign: 'right', color: 'var(--color-pass)' }}>{r.mpos_max_knm.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-4)', fontSize: 9 }}>{r.mpos_combo ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right', color: 'var(--color-fail)' }}>{r.mneg_max_knm.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-4)', fontSize: 9 }}>{r.mneg_combo ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.vu_max_kn.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-4)', fontSize: 9 }}>{r.vu_combo ?? '—'}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.nu_compression_max_kn.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.nu_tension_max_kn.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReactionsTable({ rows }: { rows: ReactionRow[] }) {
  if (rows.length === 0) return <Empty what="reactions" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>Node</th>
          <th style={{ width: 60 }}>Combo</th>
          <th className="num" style={{ textAlign: 'right' }}>Rx (kN)</th>
          <th className="num" style={{ textAlign: 'right' }}>Ry (kN)</th>
          <th className="num" style={{ textAlign: 'right' }}>Rz (kN)</th>
          <th className="num" style={{ textAlign: 'right' }}>Mx (kN·m)</th>
          <th className="num" style={{ textAlign: 'right' }}>My (kN·m)</th>
          <th className="num" style={{ textAlign: 'right' }}>Mz (kN·m)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.node_id}-${r.combo_number}-${i}`}>
            <td style={{ fontWeight: 600 }}>{r.node_id}</td>
            <td>{r.combo_number}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.rx_kn.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{r.ry_kn.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.rz_kn.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.mx_knm.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.my_knm.toFixed(2)}</td>
            <td className="num" style={{ textAlign: 'right' }}>{r.mz_knm.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DiagramPointsTable({ rows, members }: { rows: DiagramPointRow[]; members: MemberRow[] }) {
  const [memberFilter, setMemberFilter] = useState<string>('')
  const [comboFilter, setComboFilter] = useState<string>('')

  if (rows.length === 0) return <Empty what="section forces (diagram points)" />

  const memberIds = [...new Set(rows.map(r => r.member_id))].sort((a, b) => a - b)
  const comboIds = [...new Set(rows.map(r => r.combo_number))].sort((a, b) => a - b)

  const filtered = rows.filter(r =>
    (!memberFilter || r.member_id.toString() === memberFilter) &&
    (!comboFilter || r.combo_number.toString() === comboFilter),
  )

  return (
    <div>
      <div style={{ padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-line-2)', fontSize: 11 }}>
        <span style={{ color: 'var(--color-ink-3)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Filter</span>
        <select className="input" value={memberFilter} onChange={e => setMemberFilter(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          <option value="">All members ({memberIds.length})</option>
          {memberIds.map(id => {
            const m = members.find(mm => mm.member_id === id)
            return <option key={id} value={id}>Member {id}{m ? ` · ${m.section_name}` : ''}</option>
          })}
        </select>
        <select className="input" value={comboFilter} onChange={e => setComboFilter(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          <option value="">All combos ({comboIds.length})</option>
          {comboIds.map(id => <option key={id} value={id}>Combo {id}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', color: 'var(--color-ink-4)', fontSize: 10 }} className="mono">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} samples
        </span>
      </div>
      <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)', zIndex: 1 }}>
          <tr>
            <th style={{ width: 60 }}>Member</th>
            <th style={{ width: 60 }}>Combo</th>
            <th className="num" style={{ width: 50, textAlign: 'right' }}>x/L</th>
            <th className="num" style={{ width: 70, textAlign: 'right' }}>x (mm)</th>
            <th className="num" style={{ width: 90, textAlign: 'right' }}>Mz (kN·m)</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>Vy (kN)</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>N (kN)</th>
            <th className="num" style={{ width: 80, textAlign: 'right' }}>My (kN·m)</th>
            <th className="num" style={{ width: 70, textAlign: 'right' }}>Vz (kN)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 2000).map((p, i) => {
            const isFirstOfGroup = i === 0
              || filtered[i - 1].member_id !== p.member_id
              || filtered[i - 1].combo_number !== p.combo_number
            return (
              <tr key={`${p.member_id}-${p.combo_number}-${p.x_ratio}-${i}`}
                style={{ background: isFirstOfGroup ? 'var(--color-bg)' : 'transparent' }}>
                <td>{isFirstOfGroup && <span style={{ fontWeight: 600 }}>{p.member_id}</span>}</td>
                <td>{isFirstOfGroup && <span style={{ fontWeight: 600 }}>{p.combo_number}</span>}</td>
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
            )
          })}
        </tbody>
      </table>
      {filtered.length > 2000 && (
        <div style={{ padding: 8, fontSize: 10, color: 'var(--color-ink-4)', textAlign: 'center', borderTop: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
          Showing first 2,000 of {filtered.length.toLocaleString()} — use filters to narrow down.
        </div>
      )}
    </div>
  )
}

function EndForcesTable({ rows, members }: { rows: EndForceRow[]; members: MemberRow[] }) {
  const [memberFilter, setMemberFilter] = useState<string>('')
  const [comboFilter, setComboFilter] = useState<string>('')

  if (rows.length === 0) return <Empty what="end forces" />

  const memberIds = [...new Set(rows.map(r => r.member_id))].sort((a, b) => a - b)
  const comboIds = [...new Set(rows.map(r => r.combo_number))].sort((a, b) => a - b)

  const filtered = rows.filter(r =>
    (!memberFilter || r.member_id.toString() === memberFilter) &&
    (!comboFilter || r.combo_number.toString() === comboFilter),
  )

  return (
    <div>
      <div style={{ padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-line-2)', fontSize: 11 }}>
        <span style={{ color: 'var(--color-ink-3)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Filter</span>
        <select className="input" value={memberFilter} onChange={e => setMemberFilter(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          <option value="">All members ({memberIds.length})</option>
          {memberIds.map(id => {
            const m = members.find(mm => mm.member_id === id)
            return <option key={id} value={id}>Member {id}{m ? ` · ${m.section_name}` : ''}</option>
          })}
        </select>
        <select className="input" value={comboFilter} onChange={e => setComboFilter(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          <option value="">All combos ({comboIds.length})</option>
          {comboIds.map(id => <option key={id} value={id}>Combo {id}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', color: 'var(--color-ink-4)', fontSize: 10 }} className="mono">
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows
        </span>
      </div>
      <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)', zIndex: 1 }}>
          <tr>
            <th style={{ width: 60 }}>Member</th>
            <th style={{ width: 50 }}>End</th>
            <th style={{ width: 60 }}>Combo</th>
            <th className="num" style={{ textAlign: 'right' }}>Fx (kN)</th>
            <th className="num" style={{ textAlign: 'right' }}>Fy (kN)</th>
            <th className="num" style={{ textAlign: 'right' }}>Fz (kN)</th>
            <th className="num" style={{ textAlign: 'right' }}>Mx (kN·m)</th>
            <th className="num" style={{ textAlign: 'right' }}>My (kN·m)</th>
            <th className="num" style={{ textAlign: 'right' }}>Mz (kN·m)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 2000).map((r, i) => (
            <tr key={`${r.member_id}-${r.end_index}-${r.combo_number}-${i}`}>
              <td style={{ fontWeight: 600 }}>{r.member_id}</td>
              <td>{r.end_index === 0 ? 'i (start)' : 'j (end)'}</td>
              <td>{r.combo_number}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.fx_kn.toFixed(2)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.fy_kn.toFixed(2)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.fz_kn.toFixed(2)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.mx_knm.toFixed(2)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.my_knm.toFixed(2)}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{r.mz_knm.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 2000 && (
        <div style={{ padding: 8, fontSize: 10, color: 'var(--color-ink-4)', textAlign: 'center', borderTop: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
          Showing first 2,000 of {filtered.length.toLocaleString()} — use filters to narrow down.
        </div>
      )}
    </div>
  )
}

function DeflectionsTable({ rows, members }: { rows: DeflectionRow[]; members: MemberRow[] }) {
  if (rows.length === 0) return <Empty what="beam deflections" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>Member</th>
          <th>Section</th>
          <th style={{ width: 60 }}>Combo</th>
          <th className="num" style={{ textAlign: 'right' }}>x/L</th>
          <th className="num" style={{ textAlign: 'right' }}>dy (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>dz (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>L/dy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const m = members.find(mm => mm.member_id === r.member_id)
          const ratio = m && Math.abs(r.dy_mm) > 0.001 ? m.length_mm / Math.abs(r.dy_mm) : null
          const failsL360 = ratio !== null && ratio < 360
          return (
            <tr key={`${r.member_id}-${r.combo_number}-${r.x_ratio}-${i}`}>
              <td style={{ fontWeight: 600 }}>{r.member_id}</td>
              <td style={{ color: 'var(--color-ink-3)' }}>{m?.section_name ?? '—'}</td>
              <td>{r.combo_number}</td>
              <td className="num" style={{ textAlign: 'right' }}>{r.x_ratio.toFixed(2)}</td>
              <td className="num" style={{ textAlign: 'right', color: failsL360 ? 'var(--color-fail)' : 'var(--color-ink)', fontWeight: failsL360 ? 600 : 400 }}>
                {r.dy_mm.toFixed(3)}
              </td>
              <td className="num" style={{ textAlign: 'right' }}>{r.dz_mm.toFixed(3)}</td>
              <td className="num" style={{ textAlign: 'right', color: failsL360 ? 'var(--color-fail)' : 'var(--color-ink-3)' }}>
                {ratio !== null ? `L/${ratio.toFixed(0)}` : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DisplacementsTable({ rows }: { rows: DisplacementRow[] }) {
  if (rows.length === 0) return <Empty what="displacements" />
  return (
    <table className="t" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
      <thead style={{ position: 'sticky', top: 0, background: 'var(--color-panel)' }}>
        <tr>
          <th style={{ width: 60 }}>Node</th>
          <th style={{ width: 60 }}>Combo</th>
          <th className="num" style={{ textAlign: 'right' }}>dx (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>dy (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>dz (mm)</th>
          <th className="num" style={{ textAlign: 'right' }}>rx (rad)</th>
          <th className="num" style={{ textAlign: 'right' }}>ry (rad)</th>
          <th className="num" style={{ textAlign: 'right' }}>rz (rad)</th>
          <th className="num" style={{ textAlign: 'right' }}>|d| (mm)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d, i) => {
          const dabs = Math.sqrt(d.dx_mm * d.dx_mm + d.dy_mm * d.dy_mm + d.dz_mm * d.dz_mm)
          return (
            <tr key={`${d.node_id}-${d.combo_number}-${i}`}>
              <td style={{ fontWeight: 600 }}>{d.node_id}</td>
              <td>{d.combo_number}</td>
              <td className="num" style={{ textAlign: 'right' }}>{d.dx_mm.toFixed(3)}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: Math.abs(d.dy_mm) > 1 ? 600 : 400, color: Math.abs(d.dy_mm) > 1 ? 'var(--color-fail)' : 'var(--color-ink)' }}>
                {d.dy_mm.toFixed(3)}
              </td>
              <td className="num" style={{ textAlign: 'right' }}>{d.dz_mm.toFixed(3)}</td>
              <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-3)' }}>{d.rx_rad.toExponential(2)}</td>
              <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-3)' }}>{d.ry_rad.toExponential(2)}</td>
              <td className="num" style={{ textAlign: 'right', color: 'var(--color-ink-3)' }}>{d.rz_rad.toExponential(2)}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{dabs.toFixed(3)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
