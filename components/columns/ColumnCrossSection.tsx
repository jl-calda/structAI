/**
 * Column cross-section SVG with tie patterns, sideX/sideY bar distribution,
 * diamond/crossties, spiral, 135-degree hooks, and bundled corners.
 */
export function ColumnCrossSection({
  b_mm,
  h_mm,
  clear_cover_mm,
  bar_dia_mm,
  bar_count,
  tie_dia_mm,
  sideX,
  sideY,
  bundleCorners = false,
  tiePattern = 'perim',
  width = 240,
  height = 240,
}: {
  b_mm: number
  h_mm: number
  clear_cover_mm: number
  bar_dia_mm: number
  bar_count: number
  tie_dia_mm: number
  sideX?: number
  sideY?: number
  bundleCorners?: boolean
  tiePattern?: 'perim' | 'perim+x' | 'perim+xtie' | 'spiral'
  width?: number
  height?: number
}) {
  const pad = 32
  const usableW = width - 2 * pad
  const usableH = height - 2 * pad
  const scale = Math.min(usableW / b_mm, usableH / h_mm)
  const drawW = b_mm * scale
  const drawH = h_mm * scale
  const x0 = (width - drawW) / 2
  const y0 = (height - drawH) / 2
  const c = clear_cover_mm * scale
  const st = tie_dia_mm * scale

  const outerX = x0 + c
  const outerY = y0 + c
  const outerW = drawW - 2 * c
  const outerH = drawH - 2 * c

  const r = (bar_dia_mm * scale) / 2
  const cxL = outerX + st / 2 + r
  const cxR = outerX + outerW - st / 2 - r
  const cyT = outerY + st / 2 + r
  const cyB = outerY + outerH - st / 2 - r

  // Derive sideX/sideY from bar_count if not provided
  let sx = sideX
  let sy = sideY
  if (sx === undefined || sy === undefined) {
    const extra = Math.max(0, bar_count - 4)
    const innerW = cxR - cxL
    const innerH = cyB - cyT
    const totalPerim = innerW + innerH
    sx = sx ?? Math.round((extra * (innerW / totalPerim)) / 2)
    sy = sy ?? Math.round((extra * (innerH / totalPerim)) / 2)
  }

  const corners = [
    { cx: cxL, cy: cyT },
    { cx: cxR, cy: cyT },
    { cx: cxL, cy: cyB },
    { cx: cxR, cy: cyB },
  ]

  const sideBarsX: { cx: number; cy: number }[] = []
  if (sx > 0) {
    const step = (cxR - cxL) / (sx + 1)
    for (let i = 1; i <= sx; i++) {
      sideBarsX.push({ cx: cxL + i * step, cy: cyT })
      sideBarsX.push({ cx: cxL + i * step, cy: cyB })
    }
  }

  const sideBarsY: { cx: number; cy: number }[] = []
  if (sy > 0) {
    const step = (cyB - cyT) / (sy + 1)
    for (let i = 1; i <= sy; i++) {
      sideBarsY.push({ cx: cxL, cy: cyT + i * step })
      sideBarsY.push({ cx: cxR, cy: cyT + i * step })
    }
  }

  const tieR = Math.max(3, r * 0.9)
  const tieColor = '#1755A0'
  const tieStroke = 1.4

  const showDiamond = tiePattern === 'perim+x'
  const showXTies = tiePattern === 'perim+xtie'
  const showSpiral = tiePattern === 'spiral'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label="Column cross section">
      {/* Concrete */}
      <rect x={x0} y={y0} width={drawW} height={drawH}
        fill="#ECEAE4" stroke="#4A4038" strokeWidth={2.2} />

      {/* Perimeter tie / spiral */}
      {!showSpiral && (
        <>
          <rect x={outerX} y={outerY} width={outerW} height={outerH}
            rx={tieR} ry={tieR}
            fill="none" stroke={tieColor} strokeWidth={tieStroke}
            strokeLinejoin="round" />
          {/* 135-degree hook at top-right */}
          <line
            x1={outerX + outerW - tieR * 0.3} y1={outerY + tieR * 0.3}
            x2={outerX + outerW - tieR * 0.3 - 8} y2={outerY + tieR * 0.3 + 8}
            stroke={tieColor} strokeWidth={tieStroke} strokeLinecap="round" />
        </>
      )}

      {/* Spiral */}
      {showSpiral && (() => {
        const cx = outerX + outerW / 2
        const cy = outerY + outerH / 2
        const rad = Math.min(outerW, outerH) / 2
        const turns = 5
        const N = 80
        let d = ''
        for (let i = 0; i <= N; i++) {
          const t = i / N
          const ang = t * turns * 2 * Math.PI
          const rr = rad * (1 - t * 0.02)
          const px = cx + rr * Math.cos(ang)
          const py = cy + rr * Math.sin(ang) * (rad * 0.6 / rad)
          d += (i === 0 ? 'M ' : 'L ') + px.toFixed(1) + ' ' + py.toFixed(1) + ' '
        }
        return <path d={d} fill="none" stroke={tieColor} strokeWidth={1.2} opacity={0.7} />
      })()}

      {/* Diamond tie (perim+x) */}
      {showDiamond && sideBarsX.length >= 2 && sideBarsY.length >= 2 && (
        <polygon
          points={[
            `${sideBarsX[0].cx},${sideBarsX[0].cy}`,
            `${sideBarsY[1].cx},${sideBarsY[1].cy}`,
            `${sideBarsX[1].cx},${sideBarsX[1].cy}`,
            `${sideBarsY[0].cx},${sideBarsY[0].cy}`,
          ].join(' ')}
          fill="none" stroke={tieColor} strokeWidth={tieStroke * 0.85}
          strokeLinejoin="round" />
      )}

      {/* Crossties (perim+xtie) */}
      {showXTies && sideBarsX.length > 0 && (() => {
        const els: React.ReactElement[] = []
        for (let i = 0; i < sideBarsX.length; i += 2) {
          const t = sideBarsX[i]
          const bt = sideBarsX[i + 1]
          if (!t || !bt) continue
          els.push(
            <line key={`xt${i}`} x1={t.cx} y1={t.cy} x2={bt.cx} y2={bt.cy}
              stroke={tieColor} strokeWidth={tieStroke * 0.8} />,
          )
          els.push(
            <line key={`xt${i}h1`} x1={t.cx} y1={t.cy} x2={t.cx + 5} y2={t.cy + 5}
              stroke={tieColor} strokeWidth={tieStroke * 0.8} strokeLinecap="round" />,
          )
          els.push(
            <line key={`xt${i}h2`} x1={bt.cx} y1={bt.cy} x2={bt.cx - 5} y2={bt.cy - 5}
              stroke={tieColor} strokeWidth={tieStroke * 0.8} strokeLinecap="round" />,
          )
        }
        return <g>{els}</g>
      })()}

      {/* Corner bars */}
      {corners.map((p, i) => (
        <g key={`cn${i}`}>
          {bundleCorners && (
            <circle
              cx={p.cx + (p.cx < width / 2 ? r * 1.0 : -r * 1.0)}
              cy={p.cy + (p.cy < height / 2 ? r * 1.0 : -r * 1.0)}
              r={r} fill="#D4820F" stroke="#8B5000" strokeWidth={0.6} opacity={0.85} />
          )}
          <circle cx={p.cx} cy={p.cy} r={r} fill="#D4820F" stroke="#8B5000" strokeWidth={0.6} />
        </g>
      ))}

      {/* Side bars */}
      {[...sideBarsX, ...sideBarsY].map((p, i) => (
        <circle key={`sb${i}`} cx={p.cx} cy={p.cy} r={r}
          fill="#B06008" stroke="#7A4408" strokeWidth={0.6} />
      ))}

      {/* Dimensions */}
      <g fontFamily="var(--font-mono, 'JetBrains Mono', monospace)" fontSize={9} fill="#6B7079">
        <line x1={x0} y1={y0 - 14} x2={x0 + drawW} y2={y0 - 14} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={x0} y1={y0 - 17} x2={x0} y2={y0 - 11} stroke="#9CA0A8" />
        <line x1={x0 + drawW} y1={y0 - 17} x2={x0 + drawW} y2={y0 - 11} stroke="#9CA0A8" />
        <text x={x0 + drawW / 2} y={y0 - 18} textAnchor="middle">b = {b_mm.toFixed(0)}</text>

        <line x1={x0 + drawW + 12} y1={y0} x2={x0 + drawW + 12} y2={y0 + drawH} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={x0 + drawW + 9} y1={y0} x2={x0 + drawW + 15} y2={y0} stroke="#9CA0A8" />
        <line x1={x0 + drawW + 9} y1={y0 + drawH} x2={x0 + drawW + 15} y2={y0 + drawH} stroke="#9CA0A8" />
        <text x={x0 + drawW + 18} y={y0 + drawH / 2} dominantBaseline="middle">h = {h_mm.toFixed(0)}</text>
      </g>
    </svg>
  )
}
