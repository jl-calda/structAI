'use client'

import { useState } from 'react'

import type {
  CombinationRow,
  EnvelopeRow,
  LoadCaseRow,
  MaterialRow,
  MemberRow,
  NodeRow,
  ReactionRow,
  SectionRow,
} from '@/lib/data/staad'

type Tab = 'nodes' | 'members' | 'sections' | 'materials' | 'load_cases' | 'combos' | 'envelope' | 'reactions'

export function StaadDataView({
  nodes,
  members,
  sections,
  materials,
  loadCases,
  combinations,
  envelope,
  reactions,
}: {
  nodes: NodeRow[]
  members: MemberRow[]
  sections: SectionRow[]
  materials: MaterialRow[]
  loadCases: LoadCaseRow[]
  combinations: CombinationRow[]
  envelope: EnvelopeRow[]
  reactions: ReactionRow[]
}) {
  const [tab, setTab] = useState<Tab>('members')

  const tabs: { k: Tab; n: string; count: number }[] = [
    { k: 'nodes', n: 'Nodes', count: nodes.length },
    { k: 'members', n: 'Members', count: members.length },
    { k: 'sections', n: 'Sections', count: sections.length },
    { k: 'materials', n: 'Materials', count: materials.length },
    { k: 'load_cases', n: 'Load Cases', count: loadCases.length },
    { k: 'combos', n: 'Combinations', count: combinations.length },
    { k: 'envelope', n: 'Envelope', count: envelope.length },
    { k: 'reactions', n: 'Reactions', count: reactions.length },
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
        {tab === 'reactions' && <ReactionsTable rows={reactions} />}
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
          <th className="num" style={{ width: 70, textAlign: 'right' }}>Start</th>
          <th className="num" style={{ width: 70, textAlign: 'right' }}>End</th>
          <th>Section</th>
          <th className="num" style={{ textAlign: 'right' }}>Length (mm)</th>
          <th>Type</th>
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
            <td style={{ color: 'var(--color-ink-3)' }}>{r.member_type}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
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
