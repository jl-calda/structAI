'use client'

/**
 * FrameViewer — SVG rendering of the STAAD frame with hover + click.
 *
 * Orthographic projection onto the XY plane (Z ignored) per
 * docs/10-ui-layouts.md § Project Overview. Members are colour-coded by
 * `member_type`. When a member is mapped to a beam_design or
 * column_design we render a pointer cursor on hover and the whole row
 * becomes a link to that design's page. Members without a design stay
 * passive but still highlight on hover so the user can scan the frame.
 */
import Link from 'next/link'
import { useState } from 'react'

import type { MemberType } from '@/lib/supabase/types'

type MemberLite = {
  id: string
  member_id: number
  start_node_id: number
  end_node_id: number
  member_type: MemberType
}

type NodeLite = {
  id: string
  node_id: number
  x_mm: number
  y_mm: number
  support_type: string | null
}

export type MemberAssignment = {
  kind: 'beam' | 'column'
  design_id: string
  label: string
}

type Props = {
  nodes: NodeLite[]
  members: MemberLite[]
  /** member_id → design it's assigned to (if any). */
  assignments?: Record<number, MemberAssignment>
  /** Project id, for building links. */
  projectId: string
  highlightedMemberIds?: number[]
  width?: number
  height?: number
}

export function FrameViewer({
  nodes,
  members,
  assignments = {},
  projectId,
  highlightedMemberIds = [],
  width = 520,
  height = 360,
}: Props) {
  const [hoverMemberId, setHoverMemberId] = useState<number | null>(null)

  if (nodes.length === 0 || members.length === 0) {
    return <FrameEmpty width={width} height={height} />
  }

  const byId = new Map<number, NodeLite>()
  for (const n of nodes) byId.set(n.node_id, n)

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
    py: height - ((y - minY) * scale + offsetY),
  })

  const highlighted = new Set(highlightedMemberIds)
  const hoverAssignment = hoverMemberId !== null ? assignments[hoverMemberId] : undefined

  return (
    <div style={{ position: 'relative', width, height }}>
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
        {/* Invisible hit-test lines above drawn lines — easier clicks on
            thin members without widening the visible stroke. */}
        {members.map((m) => {
          const a = byId.get(m.start_node_id)
          const b = byId.get(m.end_node_id)
          if (!a || !b) return null
          const pa = project(a.x_mm, a.y_mm)
          const pb = project(b.x_mm, b.y_mm)
          const assignment = assignments[m.member_id]
          const isHi = highlighted.has(m.member_id) || hoverMemberId === m.member_id
          const stroke = isHi
            ? 'var(--color-amber)'
            : m.member_type === 'column'
              ? '#2A2622'
              : m.member_type === 'beam'
                ? '#4A4038'
                : '#8A8680'
          const strokeW = m.member_type === 'column' ? 3 : 2

          const lineElement = (
            <g key={m.id}
               onMouseEnter={() => setHoverMemberId(m.member_id)}
               onMouseLeave={() => setHoverMemberId(null)}
               style={{ cursor: assignment ? 'pointer' : 'default' }}>
              <line
                x1={pa.px} y1={pa.py}
                x2={pb.px} y2={pb.py}
                stroke={stroke}
                strokeWidth={isHi ? 3 : strokeW}
                strokeLinecap="round"
              />
              {/* Wider invisible hit area for easier hover/click. */}
              <line
                x1={pa.px} y1={pa.py}
                x2={pb.px} y2={pb.py}
                stroke="transparent"
                strokeWidth={12}
                strokeLinecap="round"
              />
            </g>
          )

          return assignment ? (
            <Link
              key={m.id}
              href={`/projects/${projectId}/${assignment.kind}s/${assignment.design_id}`}
            >
              {lineElement}
            </Link>
          ) : lineElement
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

      {/* Hover tooltip — absolute-positioned over the SVG top-right. */}
      {hoverMemberId !== null ? (
        <div
          className="absolute top-1 right-2 mono text-[10.5px] rounded px-1.5 py-0.5"
          style={{
            background: 'rgba(255,255,255,0.92)',
            border: '0.5px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          {hoverAssignment
            ? <>member {hoverMemberId} · {hoverAssignment.kind} {hoverAssignment.label} →</>
            : <>member {hoverMemberId} · unassigned</>}
        </div>
      ) : null}
    </div>
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
