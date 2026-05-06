/**
 * Beam elevation — 2D side view that reflects the actual rebar layout:
 * one drawn line per top hanger / bottom bar / bent-up bar, plus stirrup
 * zones, column stubs, and dimension callouts.
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
  t1Dia = 20,
  t1Bent = ['both', 'none', 'both'],
  t2Count = 0,
  t2Dia = 20,
  t2Bent = [],
  c1Count = 2,
  c1Dia = 20,
  c2Count = 0,
  c2Dia = 16,
  stirDia = 10,
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

  const hangerLen = Math.min(span * 0.45, bendL + 800)

  // Effective bar counts
  const t1TrussCount = t1Bent.filter(v => v === 'both').length
  const t2TrussCount = t2Bent.filter(v => v === 'both').length
  const trussCount = t1TrussCount + t2TrussCount
  const t1Straight = t1Count - t1TrussCount
  const t2Straight = t2Count - t2TrussCount
  const totalBotBars = t1Straight + t2Straight
  const totalTopHangers = c1Count + c2Count

  // Reserved bands above/below the perimeter for additional bars
  const perimTopY = top + 6
  const perimBotY = bot - 6
  const innerBandTop = top + 12 // start of "inside" band where hangers + L1/L2 stack live
  const innerBandBot = bot - 12

  // Stack top hangers c1 then c2 with a small offset per bar
  const hangerSpacing = Math.max(2.5, Math.min(4, (innerBandBot - innerBandTop) * 0.06))
  const topHangerYs: { y: number; layer: 'c1' | 'c2' }[] = []
  for (let i = 0; i < c1Count; i++) topHangerYs.push({ y: innerBandTop + (i + 1) * hangerSpacing, layer: 'c1' })
  for (let i = 0; i < c2Count; i++) topHangerYs.push({ y: innerBandTop + (c1Count + i + 1) * hangerSpacing + hangerSpacing * 0.6, layer: 'c2' })

  // Stack bottom tension bars (straight portions only) — L1 closest to perimeter, then L2
  const botSpacing = hangerSpacing
  const botBarYs: { y: number; layer: 't1' | 't2' }[] = []
  for (let i = 0; i < t1Straight; i++) botBarYs.push({ y: innerBandBot - (i + 1) * botSpacing, layer: 't1' })
  for (let i = 0; i < t2Straight; i++) botBarYs.push({ y: innerBandBot - (t1Straight + i + 1) * botSpacing - botSpacing * 0.6, layer: 't2' })

  // Bent-up bars: each rendered as a separate diagonal pair, stacked
  const bentDiagOffset = 2.5
  const bentBars: { offset: number; layer: 't1' | 't2' }[] = []
  for (let i = 0; i < t1TrussCount; i++) bentBars.push({ offset: i * bentDiagOffset, layer: 't1' })
  for (let i = 0; i < t2TrussCount; i++) bentBars.push({ offset: (t1TrussCount + i) * bentDiagOffset + 1.5, layer: 't2' })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Column stubs */}
      <rect x={L - 18} y={top - 18} width={36} height={bot - top + 36} fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <rect x={R - 18} y={top - 18} width={36} height={bot - top + 36} fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <text x={L} y={top - 22} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#6B6058">column i</text>
      <text x={R} y={top - 22} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#6B6058">column j</text>

      {/* Beam concrete */}
      <rect x={L} y={top} width={R - L} height={bot - top} fill="#ECEAE4" stroke="#4A4038" strokeWidth={1.4} />

      {/* Stirrups + zone labels */}
      {stirrups.map((x, i) => {
        const px = L + x * sx
        return <line key={i} x1={px} y1={top + 3} x2={px} y2={bot - 3} stroke="#1755A0" strokeWidth={0.6} />
      })}
      <g fontFamily="JetBrains Mono" fontSize={8.5} fill="#1755A0">
        <text x={L + (denseEnd * sx) / 2} y={bot + 12} textAnchor="middle">Ø{stirDia}@{stirSpacingEnd}</text>
        <text x={L + ((span * sx) / 2)} y={bot + 12} textAnchor="middle">Ø{stirDia}@{stirSpacingMid}</text>
        <text x={R - (denseEnd * sx) / 2} y={bot + 12} textAnchor="middle">Ø{stirDia}@{stirSpacingEnd}</text>
      </g>

      {/* Perimeter top corner bars (continuous double-line) */}
      <line x1={L} y1={perimTopY} x2={R} y2={perimTopY} stroke="#D4820F" strokeWidth={1.4} />
      <line x1={L} y1={perimTopY + 3} x2={R} y2={perimTopY + 3} stroke="#D4820F" strokeWidth={1.4} />

      {/* Perimeter bottom corner bars */}
      <line x1={L} y1={perimBotY} x2={R} y2={perimBotY} stroke="#D4820F" strokeWidth={1.4} />
      <line x1={L} y1={perimBotY - 3} x2={R} y2={perimBotY - 3} stroke="#D4820F" strokeWidth={1.4} />

      {/* Top hangers — one line per hanger bar, only over each support */}
      {topHangerYs.map(({ y, layer }, i) => (
        <g key={`h-${i}`}>
          <line x1={L} y1={y} x2={L + hangerLen * sx} y2={y} stroke="#157A6A" strokeWidth={layer === 'c1' ? 1.6 : 1.2} opacity={layer === 'c2' ? 0.75 : 1} />
          <line x1={R - hangerLen * sx} y1={y} x2={R} y2={y} stroke="#157A6A" strokeWidth={layer === 'c1' ? 1.6 : 1.2} opacity={layer === 'c2' ? 0.75 : 1} />
        </g>
      ))}

      {/* Bottom continuous tension bars (one line per straight bar) */}
      {botBarYs.map(({ y, layer }, i) => (
        <line
          key={`bt-${i}`}
          x1={L}
          y1={y}
          x2={R}
          y2={y}
          stroke="#B06008"
          strokeWidth={layer === 't1' ? 1.5 : 1.2}
          opacity={layer === 't2' ? 0.75 : 1}
        />
      ))}

      {/* Bent-up truss bars — one diagonal per bent bar, stacked with offset */}
      {bentBars.map(({ offset, layer }, i) => {
        const yBot = innerBandBot - offset
        const yTop = innerBandTop + offset + 4
        const opacity = layer === 't2' ? 0.7 : 0.9
        return (
          <g key={`bent-${i}`}>
            <path
              d={`M ${L + 4} ${yBot} L ${L + bendL * sx} ${yBot} L ${L + bendL * sx + 18} ${yTop} L ${R - 4} ${yTop}`}
              fill="none"
              stroke="#B06008"
              strokeWidth={1.3}
              strokeDasharray="5 3"
              opacity={opacity}
            />
            <path
              d={`M ${L + 4} ${yTop} L ${L + (span - bendL) * sx - 18} ${yTop} L ${L + (span - bendL) * sx} ${yBot} L ${R - 4} ${yBot}`}
              fill="none"
              stroke="#B06008"
              strokeWidth={1.3}
              strokeDasharray="5 3"
              opacity={opacity}
            />
          </g>
        )
      })}

      {/* Bend point markers and labels (when there's at least one truss bar) */}
      {trussCount > 0 && (
        <g>
          <line x1={L + bendL * sx} y1={bot - 3} x2={L + bendL * sx} y2={bot + 3} stroke="#A12424" strokeWidth={1} />
          <line x1={L + (span - bendL) * sx} y1={bot - 3} x2={L + (span - bendL) * sx} y2={bot + 3} stroke="#A12424" strokeWidth={1} />
          <text x={L + bendL * sx} y={bot + 24} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#7A4408">bend @ {bendL}</text>
          <text x={L + (span - bendL) * sx} y={bot + 24} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#7A4408">bend @ {bendL}</text>
        </g>
      )}

      {/* Supports (triangles) */}
      <polygon points={`${L - 6},${bot + 6} ${L + 6},${bot + 6} ${L},${bot}`} fill="#4A4038" />
      <polygon points={`${R - 6},${bot + 6} ${R + 6},${bot + 6} ${R},${bot}`} fill="#4A4038" />

      {/* Span dim */}
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={L} y1={height - 8} x2={R} y2={height - 8} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={L} y1={height - 11} x2={L} y2={height - 5} stroke="#9CA0A8" />
        <line x1={R} y1={height - 11} x2={R} y2={height - 5} stroke="#9CA0A8" />
        <text x={(L + R) / 2} y={height - 1} textAnchor="middle">L = {span} mm</text>
      </g>

      {/* Side rebar legend with live counts */}
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <text x={L - 4} y={perimTopY + 8} textAnchor="end" fill="#D4820F" fontWeight={600}>
          2-Ø{perimDia}{totalTopHangers > 0 ? ` + ${c1Count}-Ø${c1Dia}${c2Count > 0 ? ` + ${c2Count}-Ø${c2Dia}` : ''}` : ''}
        </text>
        <text x={L - 4} y={perimBotY - 4} textAnchor="end" fill="#B06008" fontWeight={600}>
          2-Ø{perimDia}{totalBotBars > 0 ? ` + ${t1Straight + t2Straight}-Ø${t1Dia}` : ''}
          {trussCount > 0 ? ` · ${trussCount} truss` : ''}
        </text>
      </g>
    </svg>
  )
}
