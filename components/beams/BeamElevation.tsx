/**
 * Beam elevation — 2D side view with column stubs, stirrup zones, top/
 * bottom bars, top hangers, and bent-up truss bars from the bottom row
 * to the top. Engineering colors per design system.
 */

export type BeamElevationProps = {
  span: number
  h: number
  b?: number
  cover?: number
  perimDia?: number
  t1Count?: number
  t1Dia?: number
  t1Bent?: ('none' | 'both')[]
  t2Count?: number
  t2Dia?: number
  t2Bent?: ('none' | 'both')[]
  c1Count?: number
  c1Dia?: number
  c2Count?: number
  c2Dia?: number
  stirDia?: number
  stirSpacingEnd?: number
  stirSpacingMid?: number
  denseEnd?: number
  bendL?: number
  width?: number
  height?: number
}

export function BeamElevation({
  span,
  h,
  cover = 40,
  perimDia = 20,
  t1Count = 3,
  t1Bent = ['both', 'none', 'both'],
  t2Count = 0,
  t2Bent = [],
  c1Count = 2,
  stirSpacingEnd = 100,
  stirSpacingMid = 200,
  denseEnd = 1500,
  bendL = 1200,
  width = 840,
  height = 220,
}: BeamElevationProps) {
  const padL = 60
  const padR = 32
  const padT = 22
  const padB = 38
  const w = width - padL - padR
  const innerH = height - padT - padB
  const sx = w / span
  const sy = innerH / h
  const top = padT + 8
  const bot = padT + 8 + h * sy
  const L = padL
  const R = padL + span * sx

  const stirrups: number[] = []
  for (let x = 0; x < denseEnd; x += stirSpacingEnd) stirrups.push(x)
  for (let x = denseEnd; x < span - denseEnd; x += stirSpacingMid) stirrups.push(x)
  for (let x = span - denseEnd; x <= span; x += stirSpacingEnd) stirrups.push(x)

  const topBarY = top + cover * sy + (perimDia / 2) * sy
  const botBarY = bot - cover * sy - (perimDia / 2) * sy
  const hangerLen = Math.min(span * 0.45, bendL + 800)

  const t1TrussCount = t1Bent.filter(v => v === 'both').length
  const t2TrussCount = t2Bent.filter(v => v === 'both').length
  const trussCount = t1TrussCount + t2TrussCount
  const totalBotBars = t1Count + t2Count

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={L - 18} y={top - 18} width={36} height={bot - top + 36} fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <rect x={R - 18} y={top - 18} width={36} height={bot - top + 36} fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <text x={L} y={top - 22} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#6B6058">column i</text>
      <text x={R} y={top - 22} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#6B6058">column j</text>

      <rect x={L} y={top} width={R - L} height={bot - top} fill="#ECEAE4" stroke="#4A4038" strokeWidth={1.4} />

      {stirrups.map((x, i) => {
        const px = L + x * sx
        return <line key={i} x1={px} y1={top + 3} x2={px} y2={bot - 3} stroke="#1755A0" strokeWidth={0.6} />
      })}

      <g fontFamily="JetBrains Mono" fontSize={8.5} fill="#1755A0">
        <text x={L + (denseEnd * sx) / 2} y={bot + 12} textAnchor="middle">@{stirSpacingEnd}</text>
        <text x={L + ((span * sx) / 2)} y={bot + 12} textAnchor="middle">@{stirSpacingMid}</text>
        <text x={R - (denseEnd * sx) / 2} y={bot + 12} textAnchor="middle">@{stirSpacingEnd}</text>
      </g>

      {/* Perimeter top corner bars (continuous, double-line) */}
      <line x1={L} y1={top + 6} x2={R} y2={top + 6} stroke="#D4820F" strokeWidth={1.4} />
      <line x1={L} y1={top + 9} x2={R} y2={top + 9} stroke="#D4820F" strokeWidth={1.4} />

      {/* Perimeter bottom corner bars (continuous) */}
      <line x1={L} y1={bot - 6} x2={R} y2={bot - 6} stroke="#D4820F" strokeWidth={1.4} />
      <line x1={L} y1={bot - 9} x2={R} y2={bot - 9} stroke="#D4820F" strokeWidth={1.4} />

      {/* Top hangers — over each support only */}
      {c1Count > 0 && (
        <>
          <line x1={L} y1={top + 14} x2={L + hangerLen * sx} y2={top + 14} stroke="#157A6A" strokeWidth={2} />
          <line x1={R - hangerLen * sx} y1={top + 14} x2={R} y2={top + 14} stroke="#157A6A" strokeWidth={2} />
        </>
      )}

      {/* Bottom continuous tension bars */}
      {totalBotBars > 0 && (
        <line x1={L} y1={botBarY} x2={R} y2={botBarY} stroke="#B06008" strokeWidth={1.6} />
      )}

      {/* Bent-up truss bars: bottom near midspan, then up to top at supports */}
      {trussCount > 0 && (
        <>
          <path
            d={`M ${L + 4} ${botBarY} L ${L + bendL * sx} ${botBarY} L ${L + bendL * sx + 18} ${topBarY + 4} L ${R - 4} ${topBarY + 4}`}
            fill="none"
            stroke="#B06008"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            opacity={0.85}
          />
          <path
            d={`M ${L + 4} ${topBarY + 4} L ${L + (span - bendL) * sx - 18} ${topBarY + 4} L ${L + (span - bendL) * sx} ${botBarY} L ${R - 4} ${botBarY}`}
            fill="none"
            stroke="#B06008"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            opacity={0.85}
          />
          <text x={L + bendL * sx} y={bot + 24} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#7A4408">bend @ {bendL}</text>
          <text x={L + (span - bendL) * sx} y={bot + 24} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#7A4408">bend @ {bendL}</text>
        </>
      )}

      <polygon points={`${L - 6},${bot + 6} ${L + 6},${bot + 6} ${L},${bot}`} fill="#4A4038" />
      <polygon points={`${R - 6},${bot + 6} ${R + 6},${bot + 6} ${R},${bot}`} fill="#4A4038" />

      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={L} y1={height - 8} x2={R} y2={height - 8} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={L} y1={height - 11} x2={L} y2={height - 5} stroke="#9CA0A8" />
        <line x1={R} y1={height - 11} x2={R} y2={height - 5} stroke="#9CA0A8" />
        <text x={(L + R) / 2} y={height - 1} textAnchor="middle">L = {span} mm</text>
      </g>

      <text x={L - 4} y={top + 8} textAnchor="end" fontFamily="JetBrains Mono" fontSize={9} fill="#157A6A">top</text>
      <text x={L - 4} y={bot - 4} textAnchor="end" fontFamily="JetBrains Mono" fontSize={9} fill="#B06008">bot</text>
    </svg>
  )
}
