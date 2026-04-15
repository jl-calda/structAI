/**
 * FrameViewer — SVG rendering of the STAAD frame.
 * Simple orthographic projection onto the XY plane (ignores Z for now —
 * sufficient for the overview card per docs/10-ui-layouts.md § Project
 * Overview). Members colour-coded by `member_type`; highlights render in
 * amber.
 *
 * Phase 1 scope: read-only display with auto-fit. Interaction (click-to-
 * select a member, floor grouping) is Phase 2.
 */
import type { MemberRow, NodeRow } from '@/lib/data/staad'

type Props = {
  nodes: NodeRow[]
  members: MemberRow[]
  highlightedMemberIds?: number[]
  width?: number
  height?: number
}

export function FrameViewer({
  nodes,
  members,
  highlightedMemberIds = [],
  width = 520,
  height = 360,
}: Props) {
  if (nodes.length === 0 || members.length === 0) {
    return <FrameEmpty width={width} height={height} />
  }

  // Node lookup by STAAD node_id (integer).
  const byId = new Map<number, NodeRow>()
  for (const n of nodes) byId.set(n.node_id, n)

  // Fit bounding box over the XY plane. STAAD Y is typically vertical,
  // which matches SVG's inverted Y if we flip at the end.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x_mm < minX) minX = n.x_mm
    if (n.x_mm > maxX) maxX = n.x_mm
    if (n.y_mm < minY) minY = n.y_mm
    if (n.y_mm > maxY) maxY = n.y_mm
  }
  const dx = Math.max(1, maxX - minX)
  const dy = Math.max(1, maxY - minY)
  const pad = 24
  const scale = Math.min((width - 2 * pad) / dx, (height - 2 * pad) / dy)
  const offsetX = (width - dx * scale) / 2
  const offsetY = (height - dy * scale) / 2
  const project = (x: number, y: number) => ({
    px: (x - minX) * scale + offsetX,
    py: height - ((y - minY) * scale + offsetY), // flip Y for SVG
  })

  const highlighted = new Set(highlightedMemberIds)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="STAAD frame"
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 6,
      }}
    >
      {/* Members */}
      {members.map((m) => {
        const a = byId.get(m.start_node_id)
        const b = byId.get(m.end_node_id)
        if (!a || !b) return null
        const pa = project(a.x_mm, a.y_mm)
        const pb = project(b.x_mm, b.y_mm)
        const isHi = highlighted.has(m.member_id)
        const stroke = isHi
          ? 'var(--color-amber)'
          : m.member_type === 'column'
            ? '#2A2622'
            : m.member_type === 'beam'
              ? '#4A4038'
              : '#8A8680'
        const width = m.member_type === 'column' ? 3 : 2
        return (
          <line
            key={m.id}
            x1={pa.px}
            y1={pa.py}
            x2={pb.px}
            y2={pb.py}
            stroke={stroke}
            strokeWidth={isHi ? 3 : width}
            strokeLinecap="round"
          />
        )
      })}

      {/* Support nodes */}
      {nodes
        .filter((n) => n.support_type)
        .map((n) => {
          const p = project(n.x_mm, n.y_mm)
          return (
            <polygon
              key={n.id}
              points={`${p.px - 5},${p.py + 8} ${p.px + 5},${p.py + 8} ${p.px},${p.py}`}
              fill="#4A4038"
            />
          )
        })}
    </svg>
  )
}

function FrameEmpty({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="flex items-center justify-center text-[11.5px]"
      style={{
        width,
        height,
        background: 'var(--color-surface)',
        border: '0.5px dashed var(--color-border)',
        borderRadius: 6,
        color: 'var(--color-text2)',
      }}
    >
      No STAAD geometry — run a sync from the bridge to populate the frame.
    </div>
  )
}
