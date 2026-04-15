/**
 * Beam cross-section SVG. Colours per docs/07-design-system.md.
 *   Perimeter bars (4 corners): fill amber, stroke dark amber.
 *   Additional tension: darker amber.
 *   Compression bars: teal.
 *   Stirrup/tie: blue stroke, no fill.
 *   Concrete: #E8E4DC fill, #4A4038 outline.
 */
import type { BeamTensionLayer } from '@/lib/supabase/types'

export function BeamCrossSection({
  b_mm,
  h_mm,
  clear_cover_mm,
  perimeter_dia_mm,
  tension_layers,
  compression_dia_mm,
  compression_count,
  stirrup_dia_mm,
  width = 210,
  height = 260,
}: {
  b_mm: number
  h_mm: number
  clear_cover_mm: number
  perimeter_dia_mm: number
  tension_layers: BeamTensionLayer[]
  compression_dia_mm: number
  compression_count: number
  stirrup_dia_mm: number
  width?: number
  height?: number
}) {
  const pad = 22
  const usableW = width - 2 * pad
  const usableH = height - 2 * pad
  const scale = Math.min(usableW / b_mm, usableH / h_mm)
  const drawW = b_mm * scale
  const drawH = h_mm * scale
  const x0 = (width - drawW) / 2
  const y0 = (height - drawH) / 2

  const cover = clear_cover_mm * scale
  const stirrupT = stirrup_dia_mm * scale
  const insetX = x0 + cover + stirrupT
  const insetY = y0 + cover + stirrupT
  const stirrupX = x0 + cover
  const stirrupY = y0 + cover
  const stirrupW = drawW - 2 * cover
  const stirrupH = drawH - 2 * cover

  const perimR = (perimeter_dia_mm * scale) / 2
  const perimCx1 = insetX + perimR
  const perimCx2 = x0 + drawW - cover - stirrupT - perimR
  const perimCy1 = y0 + drawH - cover - stirrupT - perimR  // bottom corners
  const perimCy2 = insetY + perimR                         // top corners

  // Bottom tension layers — additional bars, spread horizontally.
  const tensionBars = tension_layers.flatMap((l) => {
    if (l.count <= 0 || l.dia_mm <= 0) return []
    const r = (l.dia_mm * scale) / 2
    const yLevel =
      y0 + drawH - cover - stirrupT - perimR - (l.layer - 1) * (l.dia_mm * scale + 4)
    const span = perimCx2 - perimCx1
    const step = span / (l.count + 1)
    return Array.from({ length: l.count }, (_, i) => ({
      cx: perimCx1 + step * (i + 1),
      cy: yLevel,
      r,
    }))
  })

  // Compression bars — top, spread between top corners.
  const compressionBars = Array.from({ length: compression_count }, (_, i) => {
    const r = (compression_dia_mm * scale) / 2
    const span = perimCx2 - perimCx1
    const step = span / (compression_count + 1)
    return {
      cx: perimCx1 + step * (i + 1),
      cy: perimCy2,
      r,
    }
  })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Beam cross section">
      {/* Concrete */}
      <rect
        x={x0} y={y0} width={drawW} height={drawH}
        fill="#E8E4DC" stroke="#4A4038" strokeWidth={2.5}
      />
      {/* Stirrup */}
      <rect
        x={stirrupX} y={stirrupY} width={stirrupW} height={stirrupH}
        fill="none" stroke="#1755A0" strokeWidth={1.2}
      />
      {/* Perimeter 4 corners */}
      {[
        { cx: perimCx1, cy: perimCy1 },
        { cx: perimCx2, cy: perimCy1 },
        { cx: perimCx1, cy: perimCy2 },
        { cx: perimCx2, cy: perimCy2 },
      ].map((b, i) => (
        <circle
          key={i}
          cx={b.cx}
          cy={b.cy}
          r={perimR}
          fill="#D4820F"
          stroke="#8B5000"
          strokeWidth={0.8}
        />
      ))}
      {/* Additional tension */}
      {tensionBars.map((b, i) => (
        <circle
          key={`t${i}`}
          cx={b.cx}
          cy={b.cy}
          r={b.r}
          fill="#B06008"
          stroke="#8B5000"
          strokeWidth={0.8}
        />
      ))}
      {/* Compression */}
      {compressionBars.map((b, i) => (
        <circle
          key={`c${i}`}
          cx={b.cx}
          cy={b.cy}
          r={b.r}
          fill="#157A6A"
          stroke="#0A4A3A"
          strokeWidth={0.8}
        />
      ))}

      {/* Dimensions */}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#6A6560">
        <text x={x0 + drawW / 2} y={y0 - 6} textAnchor="middle">
          b = {b_mm.toFixed(0)} mm
        </text>
        <text x={x0 - 10} y={y0 + drawH / 2} textAnchor="end">
          h = {h_mm.toFixed(0)} mm
        </text>
      </g>
    </svg>
  )
}
