'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Interactive 3D axonometric P-Mx-My interaction surface (Bresler load contour).
 *
 * Drag to orbit (yaw + pitch), scroll to zoom, double-click to reset.
 * Shift+drag to pan. +/- buttons for click-zoom.
 */
export function BiaxialSurface({
  phiPnMax,
  phiMn,
  Pu,
  Mux,
  Muy,
  width = 380,
  height = 260,
}: {
  phiPnMax: number
  phiMn: number
  Pu: number
  Mux: number
  Muy: number
  width?: number
  height?: number
}) {
  const [yaw, setYaw] = useState(26)
  const [pitch, setPitch] = useState(26)
  const [zoom, setZoom] = useState(1.0)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const shiftDrag = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    shiftDrag.current = e.shiftKey
    lastPos.current = { x: e.clientX, y: e.clientY }
    svgRef.current?.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    if (shiftDrag.current) {
      setPanX(p => p + dx)
      setPanY(p => p + dy)
    } else {
      setYaw(y => Math.max(5, Math.min(80, y + dx * 0.4)))
      setPitch(p => Math.max(5, Math.min(60, p - dy * 0.4)))
    }
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false
    svgRef.current?.releasePointerCapture(e.pointerId)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.4, Math.min(4, z * (1 - e.deltaY * 0.001))))
  }, [])

  const resetView = useCallback(() => {
    setYaw(26); setPitch(26); setZoom(1.0); setPanX(0); setPanY(0)
  }, [])

  const ratio = Math.pow(Mux / phiMn, 1.5) + Math.pow(Muy / phiMn, 1.5)
  const ok = ratio <= 1.0

  const cx = width / 2 + panX
  const cy = height * 0.75 + panY
  const angX = (yaw * Math.PI) / 180
  const angY = (yaw * Math.PI) / 180
  const angPitch = (pitch * Math.PI) / 180

  const Pcap = phiPnMax
  const Ptens = -phiPnMax * 0.20
  const Pb = phiPnMax * 0.40
  const Mmax = phiMn

  const baseSM = 78 / Mmax
  const baseSP = 150 / (Pcap - Ptens)
  const sM = baseSM * zoom
  const sP = baseSP * zoom

  const proj = (mx: number, my: number, p: number): [number, number] => {
    const X = cx + my * Math.cos(angY) * sM - mx * Math.cos(angX) * sM
    const Y = cy - my * Math.sin(angPitch) * sM - mx * Math.sin(angPitch) * sM - (p - Ptens) * sP
    return [X, Y]
  }

  const shape = (P: number) => {
    if (P >= Pcap || P <= Ptens) return 0
    if (P >= Pb) {
      const t = (P - Pb) / (Pcap - Pb)
      return Math.sqrt(Math.max(0, 1 - t * t))
    }
    const t = (Pb - P) / (Pb - Ptens)
    return Math.sqrt(Math.max(0, 1 - t * t))
  }

  const N_LEVELS = 7
  const N_PTS = 28

  type RingPt = { mx: number; my: number; p: number; xy: [number, number] }
  type Ring = { P: number; s: number; pts: RingPt[] }

  const ring = (P: number): Ring => {
    const s = shape(P)
    const pts: RingPt[] = []
    for (let j = 0; j <= N_PTS; j++) {
      const a = (j / N_PTS) * (Math.PI / 2)
      const mx = Math.pow(Math.cos(a), 2 / 1.5) * Mmax * s
      const my = Math.pow(Math.sin(a), 2 / 1.5) * Mmax * s
      pts.push({ mx, my, p: P, xy: proj(mx, my, P) })
    }
    return { P, s, pts }
  }

  const levelsP = Array.from({ length: N_LEVELS }, (_, i) =>
    Ptens + (i / (N_LEVELS - 1)) * (Pcap - Ptens),
  )
  const rings = levelsP.map(ring)

  const ribAngles = [0, Math.PI / 8, Math.PI / 4, (3 * Math.PI) / 8, Math.PI / 2]
  const ribs = ribAngles.map(a => {
    const pts: [number, number][] = []
    for (let i = 0; i < 80; i++) {
      const P = Ptens + (i / 79) * (Pcap - Ptens)
      const s = shape(P)
      const mx = Math.pow(Math.cos(a), 2 / 1.5) * Mmax * s
      const my = Math.pow(Math.sin(a), 2 / 1.5) * Mmax * s
      pts.push(proj(mx, my, P))
    }
    return pts
  })

  const sliceRing = ring(Pu)
  const slicePath =
    'M ' +
    sliceRing.pts.map(p => `${p.xy[0]} ${p.xy[1]}`).join(' L ') +
    ` L ${proj(0, 0, Pu)[0]} ${proj(0, 0, Pu)[1]} Z`

  const O = proj(0, 0, Ptens)
  const Atop = proj(0, 0, Pcap)
  const Ax = proj(Mmax * 1.18, 0, Ptens)
  const Ay = proj(0, Mmax * 1.18, Ptens)

  const Pp = proj(Mux, Muy, Pu)
  const Pp_floor = proj(Mux, Muy, Ptens)
  const Pp_my = proj(0, Muy, Ptens)
  const Pp_mx = proj(Mux, 0, Ptens)

  const tickPb = proj(0, 0, Pb)
  const O0 = proj(0, 0, 0)

  const ringPath = (pts: RingPt[]) =>
    'M ' + pts.map(p => `${p.xy[0]} ${p.xy[1]}`).join(' L ')

  const ptColor = ok ? 'var(--color-pass, #1F6B3A)' : 'var(--color-fail, #A12424)'

  return (
    <div style={{ border: '1px solid var(--color-line-2)', borderRadius: 4, background: '#fff', position: 'relative' }}>
      <div style={{
        padding: '4px 10px', borderBottom: '1px solid var(--color-line-2)',
        fontSize: 10, fontWeight: 600, color: 'var(--color-ink-2)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>Biaxial Surface · P–Mx–My</span>
        <span className="mono" style={{ marginLeft: 'auto', color: ok ? 'var(--color-pass)' : 'var(--color-fail)' }}>
          (Mux/φMn)^1.5 + (Muy/φMn)^1.5 = {ratio.toFixed(2)} {ok ? '✓' : '✗'}
        </span>
      </div>

      {/* Zoom / reset controls */}
      <div style={{
        position: 'absolute', top: 34, right: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 2,
      }}>
        <button type="button" onClick={() => setZoom(z => Math.min(4, z * 1.25))}
          style={{ width: 20, height: 20, border: '1px solid var(--color-line-3)', borderRadius: 3, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-2)' }}>+</button>
        <button type="button" onClick={() => setZoom(z => Math.max(0.4, z / 1.25))}
          style={{ width: 20, height: 20, border: '1px solid var(--color-line-3)', borderRadius: 3, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-2)' }}>−</button>
      </div>

      <svg
        ref={svgRef}
        width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={resetView}
        style={{ cursor: dragging.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <defs>
          <linearGradient id="biaxFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8F0FA" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#E8F0FA" stopOpacity={0.85} />
          </linearGradient>
        </defs>

        {/* Floor plane */}
        {(() => {
          const c1 = proj(0, 0, Ptens)
          const c2 = proj(Mmax * 1.1, 0, Ptens)
          const c3 = proj(Mmax * 1.1, Mmax * 1.1, Ptens)
          const c4 = proj(0, Mmax * 1.1, Ptens)
          return (
            <polygon
              points={`${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${c3[0]},${c3[1]} ${c4[0]},${c4[1]}`}
              fill="#FAFAFB" stroke="#E4E6EA" strokeWidth={0.6} />
          )
        })()}

        {/* Back ribs */}
        {ribs.map((rib, i) => (
          <polyline key={`rb${i}`}
            points={rib.map(p => p.join(',')).join(' ')}
            fill="none" stroke="#B9C2CE" strokeWidth={0.6}
            strokeDasharray="2 2" opacity={0.55} />
        ))}

        {/* Wireframe rings */}
        {rings.map((rn, i) => {
          if (rn.s < 0.02) return null
          const isMid = Math.abs(rn.P - Pb) < (Pcap - Ptens) / (N_LEVELS * 2)
          return (
            <path key={`ring${i}`} d={ringPath(rn.pts)}
              fill="none" stroke={isMid ? '#1755A0' : '#7B8CA3'}
              strokeWidth={isMid ? 1.0 : 0.7} opacity={isMid ? 0.85 : 0.55} />
          )
        })}

        {/* Front ribs */}
        {ribs.map((rib, i) => (
          <polyline key={`rf${i}`}
            points={rib.map(p => p.join(',')).join(' ')}
            fill="none" stroke="#7B8CA3" strokeWidth={0.7} opacity={0.7} />
        ))}

        {/* Apex points */}
        <circle cx={Atop[0]} cy={Atop[1]} r={2.5} fill="#1755A0" />
        <circle cx={O[0]} cy={O[1]} r={2.5} fill="#1755A0" />

        {/* Slice at Pu */}
        <path d={slicePath} fill="url(#biaxFill)" stroke="#1755A0" strokeWidth={1.4} />

        {/* Axes */}
        <line x1={O[0]} y1={O[1]} x2={Atop[0]} y2={Atop[1]} stroke="#41464E" strokeWidth={1} />
        <polygon points={`${Atop[0] - 3},${Atop[1] + 5} ${Atop[0] + 3},${Atop[1] + 5} ${Atop[0]},${Atop[1] - 2}`} fill="#41464E" />
        <line x1={O[0]} y1={O[1]} x2={Ax[0]} y2={Ax[1]} stroke="#41464E" strokeWidth={1} />
        <line x1={O[0]} y1={O[1]} x2={Ay[0]} y2={Ay[1]} stroke="#41464E" strokeWidth={1} />

        {/* Axis ticks */}
        <line x1={O0[0] - 4} y1={O0[1]} x2={O0[0] + 4} y2={O0[1]} stroke="#9CA0A8" />
        <line x1={tickPb[0] - 4} y1={tickPb[1]} x2={tickPb[0] + 4} y2={tickPb[1]} stroke="#9CA0A8" />
        <text x={O0[0] - 7} y={O0[1] + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={8.5} fill="#6B7079">P=0</text>
        <text x={tickPb[0] - 7} y={tickPb[1] + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={8.5} fill="#6B7079">Pb≈{Math.round(Pb)}</text>
        <text x={Atop[0] + 7} y={Atop[1] + 3} fontFamily="var(--font-mono)" fontSize={9} fill="#1755A0" fontWeight={600}>φPn,max {Math.round(Pcap)}</text>

        {/* Design point leaders */}
        <line x1={Pp[0]} y1={Pp[1]} x2={Pp_floor[0]} y2={Pp_floor[1]} stroke={ptColor} strokeDasharray="2 2" strokeWidth={1} />
        <line x1={Pp_floor[0]} y1={Pp_floor[1]} x2={Pp_my[0]} y2={Pp_my[1]} stroke={ptColor} strokeDasharray="2 2" strokeWidth={0.9} />
        <line x1={Pp_floor[0]} y1={Pp_floor[1]} x2={Pp_mx[0]} y2={Pp_mx[1]} stroke={ptColor} strokeDasharray="2 2" strokeWidth={0.9} />
        <circle cx={Pp_floor[0]} cy={Pp_floor[1]} r={1.8} fill={ptColor} opacity={0.6} />
        <circle cx={Pp_my[0]} cy={Pp_my[1]} r={1.8} fill={ptColor} />
        <circle cx={Pp_mx[0]} cy={Pp_mx[1]} r={1.8} fill={ptColor} />
        <circle cx={Pp[0]} cy={Pp[1]} r={4.5} fill={ptColor} stroke="#fff" strokeWidth={1.5} />

        {/* Design point label */}
        <line x1={Pp[0]} y1={Pp[1]} x2={Pp[0] + 22} y2={Pp[1] - 18} stroke={ptColor} strokeWidth={0.6} />
        <text x={Pp[0] + 24} y={Pp[1] - 20} fontFamily="var(--font-mono)" fontSize={9.5} fill={ptColor} fontWeight={600}>
          ({Mux.toFixed(0)}, {Muy.toFixed(0)}, {Pu.toFixed(0)})
        </text>

        {/* Axis labels */}
        <text x={Atop[0]} y={Atop[1] - 9} textAnchor="middle" fontFamily="var(--font-sans)" fontSize={10} fill="#41464E" fontWeight={600}>φPn (kN)</text>
        <text x={Ax[0] - 4} y={Ax[1] + 12} textAnchor="end" fontFamily="var(--font-sans)" fontSize={10} fill="#41464E" fontWeight={600}>φMnx (kN·m)</text>
        <text x={Ay[0] + 4} y={Ay[1] + 12} fontFamily="var(--font-sans)" fontSize={10} fill="#41464E" fontWeight={600}>φMny (kN·m)</text>

        {/* Legend */}
        <g transform="translate(10, 10)">
          <line x1={0} y1={6} x2={14} y2={6} stroke="#1755A0" strokeWidth={1.4} />
          <text x={18} y={9} fontFamily="var(--font-sans)" fontSize={9} fill="#6B7079">slice @ Pu</text>
          <line x1={0} y1={20} x2={14} y2={20} stroke="#7B8CA3" strokeWidth={0.7} />
          <text x={18} y={23} fontFamily="var(--font-sans)" fontSize={9} fill="#6B7079">interaction surface</text>
        </g>

        {/* View readout */}
        <text x={width - 6} y={height - 6} textAnchor="end" fontFamily="var(--font-mono)" fontSize={8} fill="#C0C3C9">
          yaw {yaw.toFixed(0)}° pitch {pitch.toFixed(0)}° ×{zoom.toFixed(1)}
        </text>

        {/* Axis indicator */}
        <g transform={`translate(${width - 40}, ${height - 40})`}>
          {(() => {
            const len = 16
            const ax = [-len * Math.cos(angX), len * Math.sin(angPitch)]
            const ay = [len * Math.cos(angY), len * Math.sin(angPitch)]
            const az = [0, -len]
            return (
              <>
                <line x1={0} y1={0} x2={ax[0]} y2={ax[1]} stroke="#A02020" strokeWidth={1} />
                <text x={ax[0] - 4} y={ax[1] + 8} fontSize={7} fill="#A02020" fontFamily="var(--font-mono)">x</text>
                <line x1={0} y1={0} x2={ay[0]} y2={ay[1]} stroke="#1755A0" strokeWidth={1} />
                <text x={ay[0] + 3} y={ay[1] + 8} fontSize={7} fill="#1755A0" fontFamily="var(--font-mono)">y</text>
                <line x1={0} y1={0} x2={az[0]} y2={az[1]} stroke="#1F6B3A" strokeWidth={1} />
                <text x={az[0] + 3} y={az[1] - 2} fontSize={7} fill="#1F6B3A" fontFamily="var(--font-mono)">P</text>
              </>
            )
          })()}
        </g>
      </svg>

      {/* Hint */}
      <div style={{ padding: '2px 10px 4px', fontSize: 9, color: 'var(--color-ink-5)', display: 'flex', gap: 12 }}>
        <span>drag to orbit</span>
        <span>shift+drag to pan</span>
        <span>scroll to zoom</span>
        <span>double-click to reset</span>
      </div>
    </div>
  )
}
