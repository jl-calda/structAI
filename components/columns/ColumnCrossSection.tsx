/**
 * Column cross section SVG. Vertical bars distributed on the perimeter.
 * Tied (rectangular tie, blue stroke no fill).
 */
export function ColumnCrossSection({
  b_mm,
  h_mm,
  clear_cover_mm,
  bar_dia_mm,
  bar_count,
  tie_dia_mm,
  width = 220,
  height = 220,
}: {
  b_mm: number
  h_mm: number
  clear_cover_mm: number
  bar_dia_mm: number
  bar_count: number
  tie_dia_mm: number
  width?: number
  height?: number
}) {
  const pad = 20
  const usableW = width - 2 * pad
  const usableH = height - 2 * pad
  const scale = Math.min(usableW / b_mm, usableH / h_mm)
  const drawW = b_mm * scale
  const drawH = h_mm * scale
  const x0 = (width - drawW) / 2
  const y0 = (height - drawH) / 2

  const cover = clear_cover_mm * scale
  const stirrupT = tie_dia_mm * scale
  const barR = (bar_dia_mm * scale) / 2

  // Tie rectangle (inside the cover).
  const tieX = x0 + cover
  const tieY = y0 + cover
  const tieW = drawW - 2 * cover
  const tieH = drawH - 2 * cover

  // Bar centres sit just inside the tie (one bar diameter in + half bar).
  const insetX = x0 + cover + stirrupT + barR
  const insetY = y0 + cover + stirrupT + barR
  const innerW = drawW - 2 * (cover + stirrupT + barR)
  const innerH = drawH - 2 * (cover + stirrupT + barR)

  // Distribute `bar_count` bars around the perimeter. Minimum 4 (corners).
  // For N ≥ 4, split: nCorners=4, rest evenly between horizontal and vertical edges.
  const total = Math.max(4, bar_count)
  const cornerSlots = 4
  const extra = total - cornerSlots
  const hEdgeExtra = Math.round(extra * (innerW / (innerW + innerH)) / 2) // per edge (top/bot)
  const vEdgeExtra = Math.round(extra * (innerH / (innerW + innerH)) / 2) // per edge (left/right)
  const usedExtra = 2 * (hEdgeExtra + vEdgeExtra)
  // If we round down, add the shortfall to horizontal edges first.
  const shortfall = extra - usedExtra
  const hExtra = hEdgeExtra + Math.ceil(shortfall / 2)
  const vExtra = vEdgeExtra

  const positions: { cx: number; cy: number }[] = []
  // 4 corners.
  positions.push({ cx: insetX, cy: insetY })
  positions.push({ cx: insetX + innerW, cy: insetY })
  positions.push({ cx: insetX, cy: insetY + innerH })
  positions.push({ cx: insetX + innerW, cy: insetY + innerH })
  // Top edge (between top corners).
  for (let i = 0; i < hExtra; i++) {
    const t = (i + 1) / (hExtra + 1)
    positions.push({ cx: insetX + innerW * t, cy: insetY })
  }
  // Bottom edge.
  for (let i = 0; i < hExtra; i++) {
    const t = (i + 1) / (hExtra + 1)
    positions.push({ cx: insetX + innerW * t, cy: insetY + innerH })
  }
  // Left edge.
  for (let i = 0; i < vExtra; i++) {
    const t = (i + 1) / (vExtra + 1)
    positions.push({ cx: insetX, cy: insetY + innerH * t })
  }
  // Right edge.
  for (let i = 0; i < vExtra; i++) {
    const t = (i + 1) / (vExtra + 1)
    positions.push({ cx: insetX + innerW, cy: insetY + innerH * t })
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Column cross section">
      <rect
        x={x0} y={y0} width={drawW} height={drawH}
        fill="#E8E4DC" stroke="#4A4038" strokeWidth={2.5}
      />
      <rect
        x={tieX} y={tieY} width={tieW} height={tieH}
        fill="none" stroke="#1755A0" strokeWidth={1.4}
      />
      {positions.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={barR}
          fill="#D4820F"
          stroke="#8B5000"
          strokeWidth={0.8}
        />
      ))}
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
