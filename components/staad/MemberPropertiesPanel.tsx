'use client'

import type { MemberRow, NodeRow, SectionRow } from '@/lib/data/staad'

export function MemberPropertiesPanel({
  selectedIds,
  members,
  nodes,
  sections,
}: {
  selectedIds: ReadonlySet<number>
  members: MemberRow[]
  nodes: NodeRow[]
  sections: SectionRow[]
}) {
  if (selectedIds.size === 0) {
    return (
      <div className="card" style={{ height: '100%' }}>
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Member Properties
          </span>
        </div>
        <div className="cb text-[11.5px]" style={{ color: 'var(--color-text2)' }}>
          Click members in the 3D view to inspect their properties.
          Multi-select by clicking additional members.
        </div>
      </div>
    )
  }

  const nodeMap = new Map(nodes.map(n => [n.node_id, n]))
  const sectionMap = new Map(sections.map(s => [s.section_name, s]))
  const selected = members.filter(m => selectedIds.has(m.member_id))

  if (selected.length === 1) {
    const m = selected[0]
    const startNode = nodeMap.get(m.start_node_id)
    const endNode = nodeMap.get(m.end_node_id)
    const sec = sectionMap.get(m.section_name)
    return (
      <div className="card" style={{ height: '100%', overflow: 'auto' }}>
        <div className="ch">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text2)' }}>
            Member {m.member_id}
          </span>
          <span className="ml-auto tag" style={{ fontSize: 9 }}>
            {m.member_type}
          </span>
        </div>
        <div className="cb flex flex-col gap-3" style={{ fontSize: 11 }}>
          <PropGroup label="Geometry">
            <PropRow label="Section" value={m.section_name} mono />
            <PropRow label="Length" value={`${m.length_mm.toFixed(0)} mm`} mono />
            <PropRow label="Beta angle" value={`${m.beta_angle_deg.toFixed(1)}°`} mono />
          </PropGroup>

          <PropGroup label="Nodes">
            <PropRow
              label={`Start (${m.start_node_id})`}
              value={startNode ? `${fmt(startNode.x_mm)}, ${fmt(startNode.y_mm)}, ${fmt(startNode.z_mm)}` : '—'}
              mono
            />
            <PropRow
              label={`End (${m.end_node_id})`}
              value={endNode ? `${fmt(endNode.x_mm)}, ${fmt(endNode.y_mm)}, ${fmt(endNode.z_mm)}` : '—'}
              mono
            />
          </PropGroup>

          {sec && (
            <PropGroup label="Section Properties">
              <PropRow label="Type" value={sec.section_type} />
              {sec.b_mm != null && <PropRow label="b" value={`${sec.b_mm.toFixed(0)} mm`} mono />}
              {sec.h_mm != null && <PropRow label="h" value={`${sec.h_mm.toFixed(0)} mm`} mono />}
              {sec.area_mm2 != null && <PropRow label="Area" value={`${sec.area_mm2.toFixed(0)} mm²`} mono />}
              {sec.i_major_mm4 != null && <PropRow label="I major" value={`${fmtE(sec.i_major_mm4)} mm⁴`} mono />}
              {sec.i_minor_mm4 != null && <PropRow label="I minor" value={`${fmtE(sec.i_minor_mm4)} mm⁴`} mono />}
            </PropGroup>
          )}

          {(m.release_start || m.release_end) && (
            <PropGroup label="Releases">
              {m.release_start && <PropRow label="Start" value={fmtRelease(m.release_start)} mono />}
              {m.release_end && <PropRow label="End" value={fmtRelease(m.release_end)} mono />}
            </PropGroup>
          )}
        </div>
      </div>
    )
  }

  // Multi-select summary
  const sectionNames = [...new Set(selected.map(m => m.section_name))]
  const totalLength = selected.reduce((s, m) => s + m.length_mm, 0)
  const types = [...new Set(selected.map(m => m.member_type))]

  return (
    <div className="card" style={{ height: '100%', overflow: 'auto' }}>
      <div className="ch">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text2)' }}>
          {selected.length} Members Selected
        </span>
        <button
          type="button"
          className="ml-auto text-[10px]"
          style={{ color: 'var(--color-text2)', cursor: 'pointer', border: 0, background: 'none' }}
          onClick={() => {/* parent handles clear via onMemberToggle */}}
        >
        </button>
      </div>
      <div className="cb flex flex-col gap-3" style={{ fontSize: 11 }}>
        <PropGroup label="Summary">
          <PropRow label="Type" value={types.length === 1 ? types[0] : 'mixed'} />
          <PropRow label="Section" value={sectionNames.length === 1 ? sectionNames[0] : `${sectionNames.length} types`} mono />
          <PropRow label="Total length" value={`${totalLength.toFixed(0)} mm`} mono />
        </PropGroup>

        <PropGroup label="Members">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {selected.map(m => (
              <div key={m.member_id} style={{
                display: 'flex', gap: 6, alignItems: 'center',
                padding: '2px 0', fontSize: 10.5,
              }}>
                <span className="mono" style={{ width: 32, fontWeight: 600 }}>{m.member_id}</span>
                <span style={{ flex: 1, color: 'var(--color-ink-3)' }}>{m.section_name}</span>
                <span className="mono" style={{ color: 'var(--color-ink-4)' }}>{m.length_mm.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </PropGroup>
      </div>
    </div>
  )
}

function PropGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--color-ink-3)',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
    </div>
  )
}

function PropRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--color-ink-3)' }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function fmt(v: number): string {
  return v.toFixed(0)
}

function fmtE(v: number): string {
  if (Math.abs(v) >= 1e6) return v.toExponential(2)
  return v.toFixed(0)
}

function fmtRelease(r: unknown): string {
  if (!r || typeof r !== 'object') return '—'
  const obj = r as Record<string, boolean>
  const freed = Object.entries(obj).filter(([, v]) => v).map(([k]) => k.toUpperCase())
  return freed.length > 0 ? freed.join(', ') : 'fixed'
}
