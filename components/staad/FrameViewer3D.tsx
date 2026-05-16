'use client'

/**
 * FrameViewer3D — Interactive 3D structural frame viewer using SVG
 * axonometric projection (no WebGL). Y is up (vertical).
 *
 * Replaces the 2D FrameViewer with orbit, zoom, pan, view cube,
 * level filtering, label toggles, and snapshot export.
 */
import Link from 'next/link'
import { useState, useRef, useCallback, useMemo } from 'react'

import { Icon } from '@/components/ui/Icon'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NodeLite = {
  id: string
  node_id: number
  x_mm: number
  y_mm: number
  z_mm: number
  support_type: string | null
}

export type MemberLite = {
  id: string
  member_id: number
  start_node_id: number
  end_node_id: number
  member_type: 'beam' | 'column' | 'brace' | 'other'
}

export type MemberAssignment = {
  kind: 'beam' | 'column'
  design_id: string
  label: string
}

type FrameViewer3DProps = {
  nodes: NodeLite[]
  members: MemberLite[]
  assignments: Record<number, MemberAssignment>
  projectId: string
  selectedMemberId?: number | null
  selectedMemberIds?: ReadonlySet<number>
  selectedNodeId?: number | null
  onMemberSelect?: (memberId: number) => void
  onMemberToggle?: (memberId: number) => void
  onNodeSelect?: (nodeId: number) => void
  onSnapshot?: (blob: Blob) => void
  /** Members rendered faded and unclickable (e.g. wrong type for current picker). */
  dimmedMemberIds?: ReadonlySet<number>
  /** Per-member color overrides — used to paint different instances in distinct colors. */
  memberColors?: ReadonlyMap<number, string>
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEG = Math.PI / 180
const DEFAULT_YAW = 30
const DEFAULT_PITCH = 25
const MIN_ZOOM = 0.3
const MAX_ZOOM = 5
const SVG_HEIGHT = 500
const LEVEL_TOLERANCE_MM = 200

const BEAM_COLOR = '#D4820F'
const COLUMN_COLOR = '#1755A0'
const BRACE_COLOR = '#6B7079'
const OTHER_COLOR = '#9CA0A8'
const SUPPORT_FILL = '#4A4038'

/* ------------------------------------------------------------------ */
/*  Projection helpers                                                 */
/* ------------------------------------------------------------------ */

function project3D(
  x: number, y: number, z: number,
  yawDeg: number, pitchDeg: number,
): [number, number] {
  const cy = Math.cos(yawDeg * DEG)
  const sy = Math.sin(yawDeg * DEG)
  const cp = Math.cos(pitchDeg * DEG)
  const sp = Math.sin(pitchDeg * DEG)
  // Rotate around Y axis (yaw), then tilt (pitch around screen-X)
  const rx = x * cy + z * sy
  const ry = y
  const rz = -x * sy + z * cy
  const sx = rx
  const sy2 = -ry * cp + rz * sp
  return [sx, sy2]
}

/* ------------------------------------------------------------------ */
/*  ViewCube sub-component                                             */
/* ------------------------------------------------------------------ */

type ViewCubeProps = {
  yaw: number
  pitch: number
  onView: (yaw: number, pitch: number) => void
}

const CUBE_FACES: { label: string; yaw: number; pitch: number }[] = [
  { label: 'Front',  yaw: 0,    pitch: 0 },
  { label: 'Back',   yaw: 180,  pitch: 0 },
  { label: 'Right',  yaw: -90,  pitch: 0 },
  { label: 'Left',   yaw: 90,   pitch: 0 },
  { label: 'Top',    yaw: 0,    pitch: 90 },
  { label: 'Bottom', yaw: 0,    pitch: -90 },
]

const CUBE_CORNERS: { yaw: number; pitch: number }[] = [
  { yaw: 30,   pitch: 25 },  // ISO NE (default)
  { yaw: 150,  pitch: 25 },  // ISO NW
  { yaw: -30,  pitch: 25 },  // ISO SE
  { yaw: -150, pitch: 25 },  // ISO SW
  { yaw: 30,   pitch: 65 },  // top-iso NE
  { yaw: 150,  pitch: 65 },  // top-iso NW
  { yaw: -30,  pitch: 65 },  // top-iso SE
  { yaw: -150, pitch: 65 },  // top-iso SW
]

function ViewCube({ yaw, pitch, onView }: ViewCubeProps) {
  const size = 80
  const half = size / 2
  const cubeR = 22

  // Project cube vertex
  const cv = (x: number, y: number, z: number): [number, number] => {
    const [sx, sy] = project3D(x, y, z, yaw, pitch)
    return [half + sx, half + sy]
  }

  // 8 cube vertices (unit cube centered at origin, scaled by cubeR)
  const verts = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1],
  ].map(([x, y, z]) => cv(x * cubeR, y * cubeR, z * cubeR))

  // 12 edges
  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7],
  ]

  // Face label positions (center of each face)
  const faceCenters = [
    { label: 'F', pos: cv(0, 0, -cubeR) },  // Front
    { label: 'Bk', pos: cv(0, 0, cubeR) },  // Back
    { label: 'R', pos: cv(cubeR, 0, 0) },   // Right
    { label: 'L', pos: cv(-cubeR, 0, 0) },  // Left
    { label: 'T', pos: cv(0, cubeR, 0) },   // Top
    { label: 'Bt', pos: cv(0, -cubeR, 0) }, // Bottom
  ]

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        background: 'rgba(255,255,255,0.85)',
        border: '0.5px solid var(--color-line-2)',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'opacity 0.15s',
      }}
    >
      {/* Wireframe edges */}
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={verts[a][0]} y1={verts[a][1]}
          x2={verts[b][0]} y2={verts[b][1]}
          stroke="var(--color-ink-4)"
          strokeWidth={0.8}
        />
      ))}

      {/* Face labels — clickable */}
      {faceCenters.map((f, i) => (
        <text
          key={f.label}
          x={f.pos[0]}
          y={f.pos[1]}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={7}
          fontFamily="var(--font-mono)"
          fontWeight={600}
          fill="var(--color-ink-3)"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            onView(CUBE_FACES[i].yaw, CUBE_FACES[i].pitch)
          }}
        >
          {f.label}
        </text>
      ))}

      {/* Corner dots — click for isometric views */}
      {verts.map((v, i) => (
        <circle
          key={`c${i}`}
          cx={v[0]}
          cy={v[1]}
          r={3}
          fill="var(--color-ink-5)"
          stroke="var(--color-ink-4)"
          strokeWidth={0.5}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            if (CUBE_CORNERS[i]) onView(CUBE_CORNERS[i].yaw, CUBE_CORNERS[i].pitch)
          }}
        />
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Level detection                                                    */
/* ------------------------------------------------------------------ */

type Level = { y_mm: number; label: string }

function detectLevels(nodes: NodeLite[]): Level[] {
  if (nodes.length === 0) return []
  const rounded = nodes.map((n) => Math.round(n.y_mm / 100) * 100)
  const unique = [...new Set(rounded)].sort((a, b) => a - b)
  return unique.map((y, i) => ({
    y_mm: y,
    label: `L${i} (${(y / 1000).toFixed(1)}m)`,
  }))
}

/* ------------------------------------------------------------------ */
/*  FrameEmpty                                                         */
/* ------------------------------------------------------------------ */

function FrameEmpty() {
  return (
    <div
      className="flex items-center justify-center text-[11.5px]"
      style={{
        width: '100%',
        height: SVG_HEIGHT,
        background: 'var(--color-panel)',
        border: '0.5px dashed var(--color-line-2)',
        borderRadius: 6,
        color: 'var(--color-ink-3)',
      }}
    >
      No STAAD geometry — run a sync from the bridge to populate the frame.
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function FrameViewer3D({
  nodes,
  members,
  assignments,
  projectId,
  selectedMemberId = null,
  selectedMemberIds,
  selectedNodeId = null,
  onMemberSelect,
  onMemberToggle,
  onNodeSelect,
  onSnapshot,
  dimmedMemberIds,
  memberColors,
}: FrameViewer3DProps) {
  /* ----- state ----- */
  const [yaw, setYaw] = useState(DEFAULT_YAW)
  const [pitch, setPitch] = useState(DEFAULT_PITCH)
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [hoverMemberId, setHoverMemberId] = useState<number | null>(null)
  const [showMemberLabels, setShowMemberLabels] = useState(false)
  const [showNodeLabels, setShowNodeLabels] = useState(false)
  const [activeLevel, setActiveLevel] = useState<number | null>(null) // null = "All"

  /* ----- refs ----- */
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const shifting = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  /* ----- transitions (for view cube snap) ----- */
  const [animating, setAnimating] = useState(false)

  /* ----- early return ----- */
  if (nodes.length === 0 || members.length === 0) return <FrameEmpty />

  /* ----- node map ----- */
  const byId = useMemo(() => {
    const m = new Map<number, NodeLite>()
    for (const n of nodes) m.set(n.node_id, n)
    return m
  }, [nodes])

  /* ----- levels ----- */
  const levels = useMemo(() => detectLevels(nodes), [nodes])

  /* ----- visible members (filtered by level) ----- */
  const visibleMembers = useMemo(() => {
    if (activeLevel === null) return members
    return members.filter((m) => {
      const a = byId.get(m.start_node_id)
      const b = byId.get(m.end_node_id)
      if (!a || !b) return false
      return (
        Math.abs(a.y_mm - activeLevel) <= LEVEL_TOLERANCE_MM ||
        Math.abs(b.y_mm - activeLevel) <= LEVEL_TOLERANCE_MM
      )
    })
  }, [members, activeLevel, byId])

  /* ----- visible nodes ----- */
  const visibleNodeIds = useMemo(() => {
    const ids = new Set<number>()
    for (const m of visibleMembers) {
      ids.add(m.start_node_id)
      ids.add(m.end_node_id)
    }
    return ids
  }, [visibleMembers])

  const visibleNodes = useMemo(
    () => nodes.filter((n) => visibleNodeIds.has(n.node_id)),
    [nodes, visibleNodeIds],
  )

  /* ----- bounding box & projection ----- */
  const { project, viewBox } = useMemo(() => {
    // Project all nodes to find bounding box
    const pts = nodes.map((n) => project3D(n.x_mm, n.y_mm, n.z_mm, yaw, pitch))
    let minSx = Infinity, maxSx = -Infinity
    let minSy = Infinity, maxSy = -Infinity
    for (const [sx, sy] of pts) {
      if (sx < minSx) minSx = sx
      if (sx > maxSx) maxSx = sx
      if (sy < minSy) minSy = sy
      if (sy > maxSy) maxSy = sy
    }
    const dsx = Math.max(1, maxSx - minSx)
    const dsy = Math.max(1, maxSy - minSy)
    // Use a fixed container width estimate for viewBox computation
    const cw = 900
    const ch = SVG_HEIGHT
    const pad = 60
    const scale = Math.min((cw - 2 * pad) / dsx, (ch - 2 * pad) / dsy)
    const cx = (minSx + maxSx) / 2
    const cy = (minSy + maxSy) / 2

    const projectFn = (x: number, y: number, z: number): [number, number] => {
      const [sx, sy] = project3D(x, y, z, yaw, pitch)
      const px = (sx - cx) * scale * zoom + cw / 2 + panX
      const py = (sy - cy) * scale * zoom + ch / 2 + panY
      return [px, py]
    }

    return {
      project: projectFn,
      viewBox: `0 0 ${cw} ${ch}`,
    }
  }, [nodes, yaw, pitch, zoom, panX, panY])

  /* ----- pointer handlers -----
   * We deliberately delay engaging drag mode (and pointer capture) until
   * the pointer has moved past a small threshold. Capturing on pointerdown
   * stole subsequent events from child <g> members and prevented the
   * native click from firing on them — breaking member-click selection.
   */
  const pointerDown = useRef<{ x: number; y: number; id: number; pointerId: number } | null>(null)
  const DRAG_THRESHOLD_PX = 3

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDown.current = {
      x: e.clientX,
      y: e.clientY,
      id: Date.now(),
      pointerId: e.pointerId,
    }
    shifting.current = e.shiftKey
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Engage drag only after motion exceeds the threshold — otherwise
    // the press is treated as a click and bubbles to member <g> handlers.
    if (!dragging.current && pointerDown.current) {
      const dx = e.clientX - pointerDown.current.x
      const dy = e.clientY - pointerDown.current.y
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        dragging.current = true
        ;(e.currentTarget as Element).setPointerCapture(
          pointerDown.current.pointerId,
        )
      }
    }
    if (!dragging.current) return

    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    lastPointer.current = { x: e.clientX, y: e.clientY }

    if (shifting.current || e.shiftKey) {
      // Pan
      setPanX((p) => p + dx)
      setPanY((p) => p + dy)
    } else {
      // Orbit
      setYaw((y) => y + dx * 0.4)
      setPitch((p) => Math.max(-89, Math.min(89, p - dy * 0.4)))
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    pointerDown.current = null
    dragging.current = false
    shifting.current = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)))
  }, [])

  const handleDoubleClick = useCallback(() => {
    setAnimating(true)
    setYaw(DEFAULT_YAW)
    setPitch(DEFAULT_PITCH)
    setZoom(1)
    setPanX(0)
    setPanY(0)
    setTimeout(() => setAnimating(false), 400)
  }, [])

  const handleViewCubeSnap = useCallback((newYaw: number, newPitch: number) => {
    setAnimating(true)
    setYaw(newYaw)
    setPitch(newPitch)
    setTimeout(() => setAnimating(false), 400)
  }, [])

  /* ----- zoom buttons ----- */
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z * 1.25))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z / 1.25))
  }, [])

  /* ----- snapshot export ----- */
  const handleSnapshot = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const serialized = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svg.clientWidth * 2
      canvas.height = svg.clientHeight * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, svg.clientWidth, svg.clientHeight)
      URL.revokeObjectURL(url)
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return
        if (onSnapshot) {
          onSnapshot(pngBlob)
        } else {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(pngBlob)
          a.download = 'frame-snapshot.png'
          a.click()
          URL.revokeObjectURL(a.href)
        }
      }, 'image/png')
    }
    img.src = url
  }, [onSnapshot])

  /* ----- member color helper ----- */
  const memberColor = (type: MemberLite['member_type']) => {
    switch (type) {
      case 'beam': return BEAM_COLOR
      case 'column': return COLUMN_COLOR
      case 'brace': return BRACE_COLOR
      default: return OTHER_COLOR
    }
  }

  /* ----- hover assignment ----- */
  const hoverAssignment =
    hoverMemberId !== null ? assignments[hoverMemberId] : undefined

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{ width: '100%' }}>
      {/* SVG container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: SVG_HEIGHT,
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={SVG_HEIGHT}
          viewBox={viewBox}
          role="img"
          aria-label="STAAD 3D frame"
          style={{
            background: 'var(--color-panel)',
            border: '0.5px solid var(--color-line-2)',
            borderRadius: 6,
            cursor: dragging.current ? 'grabbing' : 'grab',
            transition: animating ? 'none' : undefined,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        >
          {/* Ground grid (subtle) */}
          <GroundGrid project={project} nodes={nodes} yaw={yaw} pitch={pitch} />

          {/* Members */}
          {visibleMembers.map((m) => {
            const a = byId.get(m.start_node_id)
            const b = byId.get(m.end_node_id)
            if (!a || !b) return null

            const [x1, y1] = project(a.x_mm, a.y_mm, a.z_mm)
            const [x2, y2] = project(b.x_mm, b.y_mm, b.z_mm)
            const assignment = assignments[m.member_id]
            const isDimmed = dimmedMemberIds?.has(m.member_id) ?? false
            const isSelected =
              !isDimmed &&
              (selectedMemberId === m.member_id ||
                (selectedMemberIds?.has(m.member_id) ?? false))
            const isHovered = !isDimmed && hoverMemberId === m.member_id
            const baseColor = memberColor(m.member_type)
            const overrideColor = memberColors?.get(m.member_id)
            const color = overrideColor ?? baseColor
            const clickable = !isDimmed && (
              !!onMemberToggle || !!onMemberSelect || !!assignment
            )

            const strokeW = m.member_type === 'column' ? 2.5 : 2
            const hasColorOverride = !!overrideColor && !isSelected
            const activeW = isSelected ? 4 : hasColorOverride ? 3.5 : isHovered ? 3.5 : strokeW
            const activeColor = isSelected
              ? 'var(--color-sel)'
              : color

            const lineEl = (
              <g
                key={m.id}
                onMouseEnter={() => !isDimmed && setHoverMemberId(m.member_id)}
                onMouseLeave={() => setHoverMemberId(null)}
                onClick={(e) => {
                  if (isDimmed) return
                  e.stopPropagation()
                  if (onMemberToggle) onMemberToggle(m.member_id)
                  else onMemberSelect?.(m.member_id)
                }}
                style={{ cursor: clickable ? 'pointer' : 'default', opacity: isDimmed ? 0.25 : 1 }}
              >
                {/* Glow filter for hover */}
                {isHovered && (
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={color}
                    strokeWidth={activeW + 4}
                    strokeLinecap="round"
                    opacity={0.2}
                  />
                )}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={activeColor}
                  strokeWidth={activeW}
                  strokeLinecap="round"
                  strokeDasharray={assignment ? 'none' : '6 3'}
                  opacity={isSelected || isHovered ? 1 : 0.85}
                />
                {/* Invisible wider hit area */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                />
                {/* Member label */}
                {showMemberLabels && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 6}
                    textAnchor="middle"
                    fontSize={8}
                    fontFamily="var(--font-mono)"
                    fontWeight={500}
                    fill="var(--color-ink-3)"
                    pointerEvents="none"
                  >
                    {m.member_id}
                  </text>
                )}
              </g>
            )

            // Wrap assigned members in Link for click-through, but only when
            // the viewer isn't acting as a picker (no select / toggle handler).
            if (assignment && !onMemberSelect && !onMemberToggle && !isDimmed) {
              return (
                <Link
                  key={m.id}
                  href={`/projects/${projectId}/${assignment.kind}s/${assignment.design_id}`}
                >
                  {lineEl}
                </Link>
              )
            }
            return lineEl
          })}

          {/* Nodes */}
          {visibleNodes.map((n) => {
            const [cx, cy] = project(n.x_mm, n.y_mm, n.z_mm)
            const isSelected = selectedNodeId === n.node_id
            const r = isSelected ? 5 : 3

            return (
              <g
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onNodeSelect?.(n.node_id)
                }}
                style={{ cursor: onNodeSelect ? 'pointer' : 'default' }}
              >
                {/* Support symbol */}
                {n.support_type === 'fixed' && (
                  <polygon
                    points={`${cx - 7},${cy + 10} ${cx + 7},${cy + 10} ${cx},${cy}`}
                    fill={SUPPORT_FILL}
                    opacity={0.8}
                  />
                )}
                {n.support_type === 'pinned' && (
                  <>
                    <polygon
                      points={`${cx - 6},${cy + 9} ${cx + 6},${cy + 9} ${cx},${cy}`}
                      fill="none"
                      stroke={SUPPORT_FILL}
                      strokeWidth={1.2}
                    />
                    <circle
                      cx={cx} cy={cy} r={2.5}
                      fill="none"
                      stroke={SUPPORT_FILL}
                      strokeWidth={1.2}
                    />
                  </>
                )}
                {/* Node dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={isSelected ? 'var(--color-sel)' : 'var(--color-ink-4)'}
                  stroke={isSelected ? 'var(--color-sel)' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                />
                {/* Node label */}
                {showNodeLabels && (
                  <text
                    x={cx + 6}
                    y={cy - 6}
                    fontSize={7.5}
                    fontFamily="var(--font-mono)"
                    fontWeight={500}
                    fill="var(--color-ink-3)"
                    pointerEvents="none"
                  >
                    {n.node_id}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* View cube overlay */}
        <ViewCube yaw={yaw} pitch={pitch} onView={handleViewCubeSnap} />

        {/* Hover tooltip */}
        {hoverMemberId !== null && (
          <div
            className="absolute top-2 left-2 mono text-[10.5px] rounded px-1.5 py-0.5"
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '0.5px solid var(--color-line-2)',
              color: 'var(--color-ink)',
              pointerEvents: 'none',
            }}
          >
            {hoverAssignment
              ? <>member {hoverMemberId} &middot; {hoverAssignment.kind} {hoverAssignment.label} &rarr;</>
              : <>member {hoverMemberId} &middot; unassigned</>}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{
          marginTop: 6,
          padding: '6px 8px',
          background: 'var(--color-panel)',
          border: '0.5px solid var(--color-line-2)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-ink-2)',
        }}
      >
        {/* Zoom buttons */}
        <button
          onClick={zoomOut}
          title="Zoom out"
          className="flex items-center justify-center"
          style={{
            width: 24, height: 24, borderRadius: 4,
            border: '0.5px solid var(--color-line-2)',
            background: 'var(--color-bg)',
            cursor: 'pointer',
            color: 'var(--color-ink-2)',
          }}
        >
          <Icon name="minus" size={12} />
        </button>
        <button
          onClick={zoomIn}
          title="Zoom in"
          className="flex items-center justify-center"
          style={{
            width: 24, height: 24, borderRadius: 4,
            border: '0.5px solid var(--color-line-2)',
            background: 'var(--color-bg)',
            cursor: 'pointer',
            color: 'var(--color-ink-2)',
          }}
        >
          <Icon name="plus" size={12} />
        </button>

        <span style={{ width: 1, height: 16, background: 'var(--color-line-2)' }} />

        {/* Label toggles */}
        <label
          className="flex items-center gap-1 cursor-pointer"
          style={{ fontSize: 10.5 }}
        >
          <input
            type="checkbox"
            checked={showMemberLabels}
            onChange={(e) => setShowMemberLabels(e.target.checked)}
            style={{ accentColor: BEAM_COLOR }}
          />
          Members
        </label>
        <label
          className="flex items-center gap-1 cursor-pointer"
          style={{ fontSize: 10.5 }}
        >
          <input
            type="checkbox"
            checked={showNodeLabels}
            onChange={(e) => setShowNodeLabels(e.target.checked)}
            style={{ accentColor: COLUMN_COLOR }}
          />
          Nodes
        </label>

        <span style={{ width: 1, height: 16, background: 'var(--color-line-2)' }} />

        {/* Level filter chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setActiveLevel(null)}
            style={{
              padding: '1px 6px',
              borderRadius: 3,
              border: '0.5px solid var(--color-line-2)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              background: activeLevel === null ? 'var(--color-sel-bg)' : 'var(--color-bg)',
              color: activeLevel === null ? 'var(--color-sel)' : 'var(--color-ink-3)',
              fontWeight: activeLevel === null ? 600 : 400,
            }}
          >
            All
          </button>
          {levels.map((lv) => (
            <button
              key={lv.y_mm}
              onClick={() => setActiveLevel(lv.y_mm === activeLevel ? null : lv.y_mm)}
              style={{
                padding: '1px 6px',
                borderRadius: 3,
                border: '0.5px solid var(--color-line-2)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                background: activeLevel === lv.y_mm ? 'var(--color-sel-bg)' : 'var(--color-bg)',
                color: activeLevel === lv.y_mm ? 'var(--color-sel)' : 'var(--color-ink-3)',
                fontWeight: activeLevel === lv.y_mm ? 600 : 400,
              }}
            >
              {lv.label}
            </button>
          ))}
        </div>

        <span style={{ width: 1, height: 16, background: 'var(--color-line-2)' }} />

        {/* Snapshot */}
        <button
          onClick={handleSnapshot}
          className="flex items-center gap-1"
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            border: '0.5px solid var(--color-line-2)',
            background: 'var(--color-bg)',
            cursor: 'pointer',
            fontSize: 10.5,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-ink-2)',
          }}
        >
          <Icon name="download" size={11} />
          Snapshot
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Readout */}
        <span style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>
          yaw {Math.round(yaw)}&deg; pitch {Math.round(pitch)}&deg; zoom {zoom.toFixed(1)}x
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Ground grid (subtle reference plane at y=0)                        */
/* ------------------------------------------------------------------ */

function GroundGrid({
  project,
  nodes,
  yaw,
  pitch,
}: {
  project: (x: number, y: number, z: number) => [number, number]
  nodes: NodeLite[]
  yaw: number
  pitch: number
}) {
  // Determine grid extent from node x/z range
  if (nodes.length === 0) return null
  let minX = Infinity, maxX = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const n of nodes) {
    if (n.x_mm < minX) minX = n.x_mm
    if (n.x_mm > maxX) maxX = n.x_mm
    if (n.z_mm < minZ) minZ = n.z_mm
    if (n.z_mm > maxZ) maxZ = n.z_mm
  }
  // Find the lowest y
  const minY = Math.min(...nodes.map((n) => n.y_mm))

  const dx = maxX - minX
  const dz = maxZ - minZ
  const span = Math.max(dx, dz, 1000)
  const step = Math.max(1000, Math.round(span / 6 / 1000) * 1000) // grid step in mm
  const pad = step

  const gridMinX = Math.floor((minX - pad) / step) * step
  const gridMaxX = Math.ceil((maxX + pad) / step) * step
  const gridMinZ = Math.floor((minZ - pad) / step) * step
  const gridMaxZ = Math.ceil((maxZ + pad) / step) * step

  const lines: React.ReactElement[] = []
  let idx = 0

  // X-parallel lines (varying z)
  for (let z = gridMinZ; z <= gridMaxZ; z += step) {
    const [x1, y1] = project(gridMinX, minY, z)
    const [x2, y2] = project(gridMaxX, minY, z)
    lines.push(
      <line key={idx++} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="var(--color-line-2)" strokeWidth={0.5} />
    )
  }
  // Z-parallel lines (varying x)
  for (let x = gridMinX; x <= gridMaxX; x += step) {
    const [x1, y1] = project(x, minY, gridMinZ)
    const [x2, y2] = project(x, minY, gridMaxZ)
    lines.push(
      <line key={idx++} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="var(--color-line-2)" strokeWidth={0.5} />
    )
  }

  return <g opacity={0.5}>{lines}</g>
}
