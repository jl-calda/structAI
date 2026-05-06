'use client'

import { useEffect, useRef, useState } from 'react'

import type { BentMode } from './RebarRow'

/**
 * Interactive 3D rebar cage view for beams. Engineering iso-ish
 * projection (rotate about Y, then tilt about X). Drag to orbit,
 * shift+drag to pan, wheel to zoom, double-click to reset.
 *
 * World axes: x along span, y depth (down +), z width (into page +).
 * Camera: yawDeg about Y, then pitchDeg about X.
 */
export type BeamElevation3DProps = {
  span: number
  h: number
  b: number
  cover?: number
  perimDia?: number
  t1Count?: number
  t1Dia?: number
  t1Bent?: BentMode[]
  t2Count?: number
  t2Dia?: number
  t2Bent?: BentMode[]
  t2ClearGap?: number
  c1Count?: number
  c1Dia?: number
  c2Count?: number
  c2Dia?: number
  c2ClearGap?: number
  stirDia?: number
  stirSpacingEnd?: number
  stirSpacingMid?: number
  denseEnd?: number
  bendL?: number
  width?: number
  height?: number
}

export function BeamElevation3D({
  span,
  h,
  b,
  cover = 40,
  perimDia = 20,
  t1Count = 3,
  t1Dia = 20,
  t1Bent = ['both', 'none', 'both'],
  t2Count = 0,
  t2Dia = 20,
  t2Bent = [],
  t2ClearGap = 25,
  c1Count = 2,
  c1Dia = 20,
  c2Count = 0,
  c2Dia = 16,
  c2ClearGap = 25,
  stirSpacingEnd = 100,
  stirSpacingMid = 200,
  denseEnd = 1500,
  bendL = 1200,
  width = 840,
  height = 320,
}: BeamElevation3DProps) {
  const [yawDeg, setYawDeg] = useState(22)
  const [pitchDeg, setPitchDeg] = useState(18)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<null | {
    id: number; x: number; y: number;
    yaw0: number; pitch0: number;
    panX0: number; panY0: number;
    shift: boolean
  }>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      id: e.pointerId,
      x: e.clientX, y: e.clientY,
      yaw0: yawDeg, pitch0: pitchDeg,
      panX0: pan.x, panY0: pan.y,
      shift: e.shiftKey || e.button === 1 || e.button === 2,
    }
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.shift) {
      setPan({ x: d.panX0 + dx, y: d.panY0 + dy })
    } else {
      setYawDeg(Math.max(-85, Math.min(85, d.yaw0 + dx * 0.4)))
      setPitchDeg(Math.max(-85, Math.min(85, d.pitch0 + dy * 0.4)))
    }
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current && dragRef.current.id === e.pointerId) dragRef.current = null
  }
  const onDblClick = () => {
    setYawDeg(22)
    setPitchDeg(18)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const f = Math.exp(-e.deltaY * 0.0015)
      setZoom(z => Math.max(0.4, Math.min(6, z * f)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const proj = (x: number, y: number, z: number) => ({
    x: x * cy + z * sy,
    y: -x * sp * sy + y * cp + z * sp * cy,
  })

  const padL = 60
  const padR = 32
  const padT = 22
  const padB = 38
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const xRange = Math.abs(span * cy) + Math.abs(b * sy) || 1
  const yRange = Math.abs(h * cp) + Math.abs(b * sp * cy) + Math.abs(span * sp * sy) || 1
  const sBase = Math.min(innerW / xRange, innerH / yRange) * 0.95
  const s = sBase * zoom
  const cxCam = ((span * cy + b * sy) / 2) * s
  const cyCam = ((h * cp + b * sp * cy + span * sp * sy) / 2) * s
  const ox = padL + innerW / 2 - cxCam + pan.x
  const oy = padT + innerH / 2 - cyCam + pan.y
  const P = (x: number, y: number, z: number) => {
    const p = proj(x, y, z)
    return { x: ox + p.x * s, y: oy + p.y * s }
  }

  const corners = {
    fbl: P(0, h, 0), fbr: P(span, h, 0),
    ftl: P(0, 0, 0), ftr: P(span, 0, 0),
    bbl: P(0, h, b), bbr: P(span, h, b),
    btl: P(0, 0, b), btr: P(span, 0, b),
  }
  const poly = (pts: { x: number; y: number }[]) =>
    pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

  const faceFront = poly([corners.ftl, corners.ftr, corners.fbr, corners.fbl])
  const faceTop = poly([corners.ftl, corners.ftr, corners.btr, corners.btl])
  const faceRight = poly([corners.ftr, corners.btr, corners.bbr, corners.fbr])
  const faceBack = poly([corners.btl, corners.btr, corners.bbr, corners.bbl])
  const faceLeft = poly([corners.ftl, corners.btl, corners.bbl, corners.fbl])

  const cv = cover
  const zL = cv + perimDia / 2
  const zR = b - cv - perimDia / 2
  const yTop = cv + perimDia / 2
  const yBot = h - cv - perimDia / 2
  const t1Z = (i: number) => zL + ((zR - zL) * (i + 1)) / (t1Count + 1)
  const t2Z = (i: number) => (t2Count <= 1 ? (zL + zR) / 2 : zL + ((zR - zL) * i) / (t2Count - 1))
  const t2Y = yBot - t1Dia / 2 - t2Dia / 2 - t2ClearGap
  const c1Z = (i: number) => zL + ((zR - zL) * (i + 1)) / (c1Count + 1)
  const c2Z = (i: number) => (c2Count <= 1 ? (zL + zR) / 2 : zL + ((zR - zL) * i) / (c2Count - 1))
  const c1Y = yTop
  const c2Y = yTop + c1Dia / 2 + c2Dia / 2 + c2ClearGap
  const perim = [
    { z: zL, y: yTop }, { z: zR, y: yTop },
    { z: zL, y: yBot }, { z: zR, y: yBot },
  ]

  const barColor = '#D4820F'
  const tensColor = '#B06008'
  const compColor = '#157A6A'
  const stirColor = '#1755A0'

  const Bar3D = ({
    x1, y1, z1, x2, y2, z2, color = barColor, w = 1.6, opacity = 1, dash,
  }: {
    x1: number; y1: number; z1: number
    x2: number; y2: number; z2: number
    color?: string; w?: number; opacity?: number; dash?: string
  }) => {
    const a = P(x1, y1, z1)
    const c = P(x2, y2, z2)
    return (
      <line
        x1={a.x} y1={a.y} x2={c.x} y2={c.y}
        stroke={color} strokeWidth={w} strokeLinecap="round"
        opacity={opacity} strokeDasharray={dash}
      />
    )
  }

  const drawContinuousBar = (zPos: number, bent: BentMode | undefined, _dia: number, key: string) => {
    const yB = yBot
    const yT = yTop
    const bendRun = (yB - yT) * 1.2
    const bL = bendL
    const bR = span - bendL
    const bentI = bent === 'both'
    const bentJ = bent === 'both'
    const pts: { x: number; y: number }[] = []
    pts.push({ x: 0, y: bentI ? yT : yB })
    if (bentI) {
      pts.push({ x: bL - bendRun, y: yT })
      pts.push({ x: bL, y: yB })
    }
    if (bentJ) {
      pts.push({ x: bR, y: yB })
      pts.push({ x: bR + bendRun, y: yT })
      pts.push({ x: span, y: yT })
    } else {
      pts.push({ x: span, y: yB })
    }
    return (
      <g key={key}>
        {pts.slice(0, -1).map((p, i) => {
          const q = pts[i + 1]
          const back = zPos > b / 2
          return (
            <Bar3D
              key={i}
              x1={p.x} y1={p.y} z1={zPos}
              x2={q.x} y2={q.y} z2={zPos}
              color={tensColor}
              w={1.6}
              opacity={back ? 0.35 : 1}
              dash={back ? '3 3' : undefined}
            />
          )
        })}
      </g>
    )
  }

  const stirrupXs: number[] = []
  for (let x = 0; x < denseEnd; x += stirSpacingEnd) stirrupXs.push(x)
  for (let x = denseEnd; x < span - denseEnd; x += stirSpacingMid) stirrupXs.push(x)
  for (let x = span - denseEnd; x <= span; x += stirSpacingEnd) stirrupXs.push(x)

  const StirrupAt = ({ x, opacity = 1 }: { x: number; opacity?: number }) => {
    const sZ1 = cv, sZ2 = b - cv
    const sY1 = cv, sY2 = h - cv
    const a = P(x, sY1, sZ1), bb = P(x, sY1, sZ2)
    const c = P(x, sY2, sZ2), d = P(x, sY2, sZ1)
    return (
      <polygon
        points={`${a.x},${a.y} ${bb.x},${bb.y} ${c.x},${c.y} ${d.x},${d.y}`}
        fill="none" stroke={stirColor} strokeWidth={1} opacity={opacity}
      />
    )
  }

  const supportTriangle = (xPos: number) => {
    const a = P(xPos, h, 0), b2 = P(xPos - 18, h + 26, 0), c = P(xPos + 18, h + 26, 0)
    const d = P(xPos, h, b), e = P(xPos - 18, h + 26, b), f = P(xPos + 18, h + 26, b)
    return (
      <g>
        <polygon points={`${a.x},${a.y} ${b2.x},${b2.y} ${c.x},${c.y}`} fill="#4A4038" />
        <polygon points={`${d.x},${d.y} ${e.x},${e.y} ${f.x},${f.y}`} fill="#6B6058" />
      </g>
    )
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      ref={svgRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={e => e.preventDefault()}
      onDoubleClick={onDblClick}
      style={{
        cursor: dragRef.current ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
        background: '#FAFAF7',
        borderRadius: 6,
        border: '1px solid var(--color-line-2)',
      }}
    >
      <defs>
        <linearGradient id="concreteFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0EDE6" stopOpacity="0.55" />
          <stop offset="1" stopColor="#D9D4C9" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="concreteTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8F5EE" />
          <stop offset="1" stopColor="#E8E3D7" />
        </linearGradient>
        <linearGradient id="concreteRight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D6D0C2" />
          <stop offset="1" stopColor="#BCB6A6" />
        </linearGradient>
      </defs>

      <polygon points={faceBack} fill="none" stroke="#9A9486" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />
      <polygon points={faceLeft} fill="none" stroke="#9A9486" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />

      <polygon points={faceTop} fill="url(#concreteTop)" stroke="#4A4038" strokeWidth={1.2} />
      <polygon points={faceRight} fill="url(#concreteRight)" stroke="#4A4038" strokeWidth={1.2} />

      {stirrupXs.map((x, i) => <StirrupAt key={'st' + i} x={x} opacity={0.9} />)}

      {perim.map((p, i) => (
        <Bar3D
          key={'pe' + i}
          x1={0} y1={p.y} z1={p.z}
          x2={span} y2={p.y} z2={p.z}
          color={barColor}
          w={2}
        />
      ))}

      {Array.from({ length: t1Count }).map((_, i) =>
        drawContinuousBar(t1Z(i), t1Bent[i] || 'none', t1Dia, 't1-' + i),
      )}
      {Array.from({ length: t2Count }).map((_, i) =>
        drawContinuousBar(t2Z(i), t2Bent[i] || 'none', t2Dia, 't2-' + i),
      )}

      {Array.from({ length: c1Count }).map((_, i) => {
        const z = c1Z(i)
        const lh = bendL + 600
        return (
          <g key={'c1-' + i}>
            <Bar3D x1={0} y1={c1Y} z1={z} x2={lh} y2={c1Y} z2={z} color={compColor} w={1.6} opacity={z > b / 2 ? 0.4 : 1} dash={z > b / 2 ? '3 3' : undefined} />
            <Bar3D x1={span - lh} y1={c1Y} z1={z} x2={span} y2={c1Y} z2={z} color={compColor} w={1.6} opacity={z > b / 2 ? 0.4 : 1} dash={z > b / 2 ? '3 3' : undefined} />
          </g>
        )
      })}
      {Array.from({ length: c2Count }).map((_, i) => {
        const z = c2Z(i)
        const lh = bendL + 400
        return (
          <g key={'c2-' + i}>
            <Bar3D x1={0} y1={c2Y} z1={z} x2={lh} y2={c2Y} z2={z} color={compColor} w={1.4} opacity={z > b / 2 ? 0.4 : 1} dash={z > b / 2 ? '3 3' : undefined} />
            <Bar3D x1={span - lh} y1={c2Y} z1={z} x2={span} y2={c2Y} z2={z} color={compColor} w={1.4} opacity={z > b / 2 ? 0.4 : 1} dash={z > b / 2 ? '3 3' : undefined} />
          </g>
        )
      })}

      <polygon points={faceFront} fill="url(#concreteFront)" stroke="#4A4038" strokeWidth={1.4} />

      {supportTriangle(0)}
      {supportTriangle(span)}

      <g fontFamily="JetBrains Mono" fontSize={9.5} fill="#6B7079">
        {(() => {
          const a = P(0, h + 36, 0), bb = P(span, h + 36, 0)
          return (
            <g>
              <line x1={a.x} y1={a.y} x2={bb.x} y2={bb.y} stroke="#9CA0A8" strokeWidth={0.6} />
              <line x1={a.x} y1={a.y - 4} x2={a.x} y2={a.y + 4} stroke="#9CA0A8" />
              <line x1={bb.x} y1={bb.y - 4} x2={bb.x} y2={bb.y + 4} stroke="#9CA0A8" />
              <text x={(a.x + bb.x) / 2} y={a.y + 12} textAnchor="middle">L = {span} mm</text>
            </g>
          )
        })()}
        {(() => {
          const a = P(span + 60, 0, 0), bb = P(span + 60, h, 0)
          return (
            <g>
              <line x1={a.x} y1={a.y} x2={bb.x} y2={bb.y} stroke="#9CA0A8" strokeWidth={0.6} />
              <line x1={a.x - 4} y1={a.y} x2={a.x + 4} y2={a.y} stroke="#9CA0A8" />
              <line x1={bb.x - 4} y1={bb.y} x2={bb.x + 4} y2={bb.y} stroke="#9CA0A8" />
              <text x={a.x + 8} y={(a.y + bb.y) / 2} dominantBaseline="middle">h = {h}</text>
            </g>
          )
        })()}
      </g>

      <g transform={`translate(${padL - 28}, ${padT})`} fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        {(() => {
          const O = { x: 0, y: 0 }
          const ax = proj(40, 0, 0), ay = proj(0, 30, 0), az = proj(0, 0, 40)
          return (
            <g>
              <line x1={O.x} y1={O.y} x2={ax.x} y2={ax.y} stroke="#A12424" strokeWidth={1.2} />
              <text x={ax.x + 3} y={ax.y + 3} fill="#A12424">x</text>
              <line x1={O.x} y1={O.y} x2={ay.x} y2={ay.y} stroke="#1755A0" strokeWidth={1.2} />
              <text x={ay.x + 3} y={ay.y + 8} fill="#1755A0">y</text>
              <line x1={O.x} y1={O.y} x2={az.x} y2={az.y} stroke="#157A6A" strokeWidth={1.2} />
              <text x={az.x + 3} y={az.y + 3} fill="#157A6A">z</text>
            </g>
          )
        })()}
      </g>

      <g fontFamily="JetBrains Mono" fontSize={9} fill="#9A9486">
        <text x={width - padR} y={height - 22} textAnchor="end">drag · orbit  ·  shift+drag · pan  ·  wheel · zoom  ·  dbl-click · reset</text>
        <text x={width - padR} y={height - 10} textAnchor="end" fill="#6B7079">
          yaw {yawDeg.toFixed(0)}°  pitch {pitchDeg.toFixed(0)}°  zoom {zoom.toFixed(2)}×
        </text>
      </g>

      <g transform={`translate(${width - padR - 56}, ${padT - 4})`} style={{ cursor: 'pointer' }}>
        <g onPointerDown={e => { e.stopPropagation(); setZoom(z => Math.min(6, z * 1.25)) }}>
          <rect x={0} y={0} width={24} height={20} fill="#fff" stroke="var(--color-line)" rx={3} />
          <text x={12} y={14} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={13} fill="#4A4038">+</text>
        </g>
        <g onPointerDown={e => { e.stopPropagation(); setZoom(z => Math.max(0.4, z / 1.25)) }} transform="translate(28, 0)">
          <rect x={0} y={0} width={24} height={20} fill="#fff" stroke="var(--color-line)" rx={3} />
          <text x={12} y={14} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={13} fill="#4A4038">−</text>
        </g>
      </g>
    </svg>
  )
}
