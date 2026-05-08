/**
 * Column elevation SVG — vertical column showing confined zones at top/bottom
 * with denser tie spacing, vertical bars, joint blocks, and dimension callouts.
 */
export function ColumnElevation({
  b,
  h,
  Hc,
  cover,
  barDia,
  tieDia,
  sConf,
  sMid,
  loConf,
  width = 840,
  height = 300,
}: {
  b: number
  h: number
  Hc: number
  cover: number
  barDia: number
  tieDia: number
  sConf: number
  sMid: number
  loConf: number
  width?: number
  height?: number
}) {
  const padL = 60, padR = 60, padT = 16, padB = 30
  const innerH = height - padT - padB
  const sy = innerH / Hc

  const colW = Math.min(width - padL - padR, b * 0.35)
  const cx = width / 2
  const x0 = cx - colW / 2
  const yTop = padT, yBot = padT + innerH

  const ties: { y: number; zone: 'conf' | 'mid' }[] = []
  for (let y = 0; y <= loConf; y += sConf) ties.push({ y, zone: 'conf' })
  for (let y = loConf + sMid; y < Hc - loConf; y += sMid) ties.push({ y, zone: 'mid' })
  for (let y = Hc - loConf; y <= Hc; y += sConf) ties.push({ y, zone: 'conf' })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Joint blocks */}
      <rect x={x0 - 30} y={yTop - 18} width={colW + 60} height={18}
        fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <rect x={x0 - 30} y={yBot} width={colW + 60} height={18}
        fill="#E8E3D7" stroke="#7A6E5A" strokeWidth={1} />
      <text x={x0 - 36} y={yTop - 6} textAnchor="end"
        fontFamily="var(--font-mono)" fontSize={9} fill="#6B6058">joint top</text>
      <text x={x0 - 36} y={yBot + 12} textAnchor="end"
        fontFamily="var(--font-mono)" fontSize={9} fill="#6B6058">joint bot</text>

      {/* Concrete column */}
      <rect x={x0} y={yTop} width={colW} height={innerH}
        fill="#ECEAE4" stroke="#4A4038" strokeWidth={1.6} />

      {/* Confined zone shading */}
      <rect x={x0} y={yTop} width={colW} height={loConf * sy}
        fill="#FEF3E0" opacity={0.5} />
      <rect x={x0} y={yBot - loConf * sy} width={colW} height={loConf * sy}
        fill="#FEF3E0" opacity={0.5} />

      {/* Vertical bars (symbolic) */}
      <line x1={x0 + 5} y1={yTop} x2={x0 + 5} y2={yBot}
        stroke="#D4820F" strokeWidth={1.4} />
      <line x1={x0 + colW - 5} y1={yTop} x2={x0 + colW - 5} y2={yBot}
        stroke="#D4820F" strokeWidth={1.4} />

      {/* Ties */}
      {ties.map((t, i) => {
        const py = yTop + t.y * sy
        if (py > yBot) return null
        return (
          <line key={i}
            x1={x0 + 1.5} y1={py} x2={x0 + colW - 1.5} y2={py}
            stroke="#1755A0" strokeWidth={t.zone === 'conf' ? 1.0 : 0.7}
            opacity={t.zone === 'conf' ? 0.95 : 0.8} />
        )
      })}

      {/* Dimension callouts */}
      <g fontFamily="var(--font-mono)" fontSize={9} fill="#6B7079">
        {/* Total height */}
        <line x1={x0 + colW + 30} y1={yTop} x2={x0 + colW + 30} y2={yBot}
          stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={x0 + colW + 27} y1={yTop} x2={x0 + colW + 33} y2={yTop} stroke="#9CA0A8" />
        <line x1={x0 + colW + 27} y1={yBot} x2={x0 + colW + 33} y2={yBot} stroke="#9CA0A8" />
        <text x={x0 + colW + 38} y={(yTop + yBot) / 2} dominantBaseline="middle">Hc = {Hc} mm</text>

        {/* lo zones */}
        <line x1={x0 - 18} y1={yTop} x2={x0 - 18} y2={yTop + loConf * sy}
          stroke="#B06008" strokeWidth={0.8} />
        <text x={x0 - 22} y={yTop + (loConf * sy) / 2} textAnchor="end"
          fontSize={9} fill="#8A6112" dominantBaseline="middle">
          lo {loConf}
        </text>
        <line x1={x0 - 18} y1={yBot - loConf * sy} x2={x0 - 18} y2={yBot}
          stroke="#B06008" strokeWidth={0.8} />
        <text x={x0 - 22} y={yBot - (loConf * sy) / 2} textAnchor="end"
          fontSize={9} fill="#8A6112" dominantBaseline="middle">
          lo {loConf}
        </text>

        {/* Spacing labels */}
        <text x={x0 + colW + 8} y={yTop + (loConf * sy) / 2} dominantBaseline="middle" fill="#8A6112">
          @ {sConf}
        </text>
        <text x={x0 + colW + 8} y={yTop + innerH / 2} dominantBaseline="middle">
          @ {sMid}
        </text>
        <text x={x0 + colW + 8} y={yBot - (loConf * sy) / 2} dominantBaseline="middle" fill="#8A6112">
          @ {sConf}
        </text>
      </g>
    </svg>
  )
}
