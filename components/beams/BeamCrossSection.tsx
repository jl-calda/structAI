/**
 * Beam cross-section SVG — supports L1/L2 tension + L1/L2 compression,
 * torsional bars on perimeter mid-height, and variable stirrup legs
 * (2/3/4/6 leg) with rendered ties + 135° hooks.
 *
 * Engineering colors (amber/teal/blue/purple) preserved per design system.
 *
 * The legacy signature (using `tension_layers`/`compression_count`) is also
 * accepted via the `LegacyBeamCrossSection` wrapper below for back-compat
 * with existing callers.
 */
import type { BeamTensionLayer } from '@/lib/supabase/types'

export type BeamCrossSectionProps = {
  b?: number
  h?: number
  cover?: number
  perimDia?: number
  tens1Count?: number
  tens1Dia?: number
  tens2Count?: number
  tens2Dia?: number
  tens2ClearGap?: number
  comp1Count?: number
  comp1Dia?: number
  comp2Count?: number
  comp2Dia?: number
  comp2ClearGap?: number
  torsionCount?: number
  torsionDia?: number
  stirrupDia?: number
  stirrupLegs?: 2 | 3 | 4 | 6
  width?: number
  height?: number
}

export function BeamCrossSection({
  b = 300,
  h = 550,
  cover = 40,
  perimDia = 20,
  tens1Count = 2,
  tens1Dia = 20,
  tens2Count = 0,
  tens2Dia = 20,
  tens2ClearGap = 25,
  comp1Count = 2,
  comp1Dia = 16,
  comp2Count = 0,
  comp2Dia = 16,
  comp2ClearGap = 25,
  torsionCount = 0,
  torsionDia = 12,
  stirrupDia = 10,
  stirrupLegs = 2,
  width = 240,
  height = 320,
}: BeamCrossSectionProps) {
  const pad = 36
  const usableW = width - 2 * pad
  const usableH = height - 2 * pad
  const scale = Math.min(usableW / b, usableH / h)
  const drawW = b * scale
  const drawH = h * scale
  const x0 = (width - drawW) / 2
  const y0 = (height - drawH) / 2
  const c = cover * scale
  const st = stirrupDia * scale

  const outerX = x0 + c
  const outerY = y0 + c
  const outerW = drawW - 2 * c
  const outerH = drawH - 2 * c

  const perimR = (perimDia * scale) / 2
  const cx1 = outerX + st / 2 + perimR
  const cx2 = outerX + outerW - st / 2 - perimR
  const cyBot = outerY + outerH - st / 2 - perimR
  const cyTop = outerY + st / 2 + perimR

  const t1R = (tens1Dia * scale) / 2
  const tSpan = cx2 - cx1
  const t1Step = tSpan / (tens1Count + 1)
  const t1Bars = Array.from({ length: tens1Count }, (_, i) => ({
    cx: cx1 + t1Step * (i + 1),
    cy: cyBot,
    r: t1R,
    color: '#B06008',
  }))

  const t2R = (tens2Dia * scale) / 2
  const t2y = cyBot - t1R - t2R - tens2ClearGap * scale
  const t2Bars = Array.from({ length: tens2Count }, (_, i) => ({
    cx: tens2Count === 1 ? (cx1 + cx2) / 2 : cx1 + ((cx2 - cx1) * i) / Math.max(1, tens2Count - 1),
    cy: t2y,
    r: t2R,
    color: '#B06008',
  }))

  const c1R = (comp1Dia * scale) / 2
  const c1Step = tSpan / (comp1Count + 1)
  const c1Bars = Array.from({ length: comp1Count }, (_, i) => ({
    cx: cx1 + c1Step * (i + 1),
    cy: cyTop,
    r: c1R,
    color: '#157A6A',
  }))

  const c2R = (comp2Dia * scale) / 2
  const c2y = cyTop + c1R + c2R + comp2ClearGap * scale
  const c2Bars = Array.from({ length: comp2Count }, (_, i) => ({
    cx: comp2Count === 1 ? (cx1 + cx2) / 2 : cx1 + ((cx2 - cx1) * i) / Math.max(1, comp2Count - 1),
    cy: c2y,
    r: c2R,
    color: '#157A6A',
  }))

  const torsR = (torsionDia * scale) / 2
  const totalH = cyBot - cyTop
  const torsBars: { cx: number; cy: number; r: number; color: string }[] = []
  for (let i = 1; i <= torsionCount; i++) {
    const yi = cyTop + (totalH * i) / (torsionCount + 1)
    torsBars.push({ cx: cx1, cy: yi, r: torsR, color: '#7A4FB0' })
    torsBars.push({ cx: cx2, cy: yi, r: torsR, color: '#7A4FB0' })
  }

  const tieR = Math.max(3, perimR * 0.9)
  const stirrupColor = '#1755A0'
  const stirrupStroke = 1.4

  const hookLen = Math.max(8, st * 4)
  const hookAngle = 45
  const hookDx = hookLen * Math.cos((hookAngle * Math.PI) / 180)
  const hookDy = hookLen * Math.sin((hookAngle * Math.PI) / 180)

  const innerTies: { x: number; y: number; w: number; h: number }[] = []
  const crossties: { x: number; y1: number; y2: number }[] = []
  if (stirrupLegs === 3) {
    crossties.push({ x: (cx1 + cx2) / 2, y1: outerY, y2: outerY + outerH })
  }
  if (stirrupLegs >= 4) {
    const innerW = (cx2 - cx1) * (stirrupLegs === 4 ? 0.5 : 0.7)
    const innerX = (cx1 + cx2) / 2 - innerW / 2
    innerTies.push({ x: innerX, y: outerY, w: innerW, h: outerH })
  }
  if (stirrupLegs >= 6) {
    const innerW2 = (cx2 - cx1) * 0.28
    const innerX2 = (cx1 + cx2) / 2 - innerW2 / 2
    innerTies.push({ x: innerX2, y: outerY, w: innerW2, h: outerH })
  }

  const corners = [
    { cx: cx1, cy: cyTop }, { cx: cx2, cy: cyTop },
    { cx: cx1, cy: cyBot }, { cx: cx2, cy: cyBot },
  ]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={x0} y={y0} width={drawW} height={drawH} fill="#ECEAE4" stroke="#4A4038" strokeWidth={2.2} />
      <rect
        x={outerX} y={outerY} width={outerW} height={outerH} rx={tieR} ry={tieR}
        fill="none" stroke={stirrupColor} strokeWidth={stirrupStroke} strokeLinejoin="round"
      />
      <line
        x1={outerX + outerW - tieR * 0.3} y1={outerY + tieR * 0.3}
        x2={outerX + outerW - tieR * 0.3 - hookDx} y2={outerY + tieR * 0.3 + hookDy}
        stroke={stirrupColor} strokeWidth={stirrupStroke} strokeLinecap="round"
      />
      <line
        x1={outerX + outerW + 2} y1={outerY + tieR + 2}
        x2={outerX + outerW + 2 - hookDx * 0.7} y2={outerY + tieR + 2 + hookDy * 0.7}
        stroke={stirrupColor} strokeWidth={stirrupStroke * 0.8} strokeLinecap="round" opacity={0.55}
      />

      {innerTies.map((s, i) => (
        <g key={`it${i}`}>
          <rect
            x={s.x} y={s.y} width={s.w} height={s.h}
            rx={tieR * 0.8} ry={tieR * 0.8}
            fill="none" stroke={stirrupColor}
            strokeWidth={stirrupStroke * 0.85} strokeLinejoin="round"
          />
          <line
            x1={s.x + s.w - tieR * 0.3} y1={s.y + s.h - tieR * 0.3}
            x2={s.x + s.w - tieR * 0.3 - hookDx * 0.8} y2={s.y + s.h - tieR * 0.3 - hookDy * 0.8}
            stroke={stirrupColor} strokeWidth={stirrupStroke * 0.8} strokeLinecap="round"
          />
        </g>
      ))}

      {crossties.map((ct, i) => (
        <g key={`ct${i}`}>
          <line
            x1={ct.x} y1={ct.y1 + tieR * 0.2}
            x2={ct.x} y2={ct.y2 - tieR * 0.2}
            stroke={stirrupColor} strokeWidth={stirrupStroke} strokeLinecap="round"
          />
          <line
            x1={ct.x} y1={ct.y1 + tieR * 0.2}
            x2={ct.x + tieR * 0.9} y2={ct.y1 + tieR * 0.2}
            stroke={stirrupColor} strokeWidth={stirrupStroke} strokeLinecap="round"
          />
          <line
            x1={ct.x} y1={ct.y2 - tieR * 0.2}
            x2={ct.x - hookDx * 0.6} y2={ct.y2 - tieR * 0.2 - hookDy * 0.6}
            stroke={stirrupColor} strokeWidth={stirrupStroke} strokeLinecap="round"
          />
        </g>
      ))}

      {corners.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={perimR} fill="#D4820F" stroke="#8B5000" strokeWidth={0.6} />
      ))}

      {[...t1Bars, ...t2Bars, ...c1Bars, ...c2Bars, ...torsBars].map((bar, i) => (
        <circle
          key={i}
          cx={bar.cx} cy={bar.cy} r={bar.r}
          fill={bar.color}
          stroke={bar.color === '#7A4FB0' ? '#4A2D70' : bar.color === '#157A6A' ? '#0A4A3A' : '#8B5000'}
          strokeWidth={0.6}
        />
      ))}

      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={x0} y1={y0 - 14} x2={x0 + drawW} y2={y0 - 14} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={x0} y1={y0 - 17} x2={x0} y2={y0 - 11} stroke="#9CA0A8" />
        <line x1={x0 + drawW} y1={y0 - 17} x2={x0 + drawW} y2={y0 - 11} stroke="#9CA0A8" />
        <text x={x0 + drawW / 2} y={y0 - 18} textAnchor="middle">b = {b}</text>
        <line x1={x0 + drawW + 12} y1={y0} x2={x0 + drawW + 12} y2={y0 + drawH} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={x0 + drawW + 9} y1={y0} x2={x0 + drawW + 15} y2={y0} stroke="#9CA0A8" />
        <line x1={x0 + drawW + 9} y1={y0 + drawH} x2={x0 + drawW + 15} y2={y0 + drawH} stroke="#9CA0A8" />
        <text x={x0 + drawW + 18} y={y0 + drawH / 2} dominantBaseline="middle">h = {h}</text>
      </g>
    </svg>
  )
}

/**
 * Legacy back-compat wrapper — accepts the old prop shape used by the
 * existing beam page (tension_layers + compression_count + stirrup_legs)
 * and delegates to the new BeamCrossSection.
 */
export function LegacyBeamCrossSection({
  b_mm,
  h_mm,
  cover_mm,
  perimeter_dia_mm,
  tension_layers,
  compression_count,
  compression_dia_mm,
  stirrup_dia_mm,
  stirrup_legs = 2,
  width = 240,
  height = 320,
}: {
  b_mm: number
  h_mm: number
  cover_mm: number
  perimeter_dia_mm: number
  tension_layers: BeamTensionLayer[]
  compression_count: number
  compression_dia_mm: number
  stirrup_dia_mm: number
  stirrup_legs?: number
  width?: number
  height?: number
}) {
  const t1 = tension_layers[0]
  const t2 = tension_layers[1]
  return (
    <BeamCrossSection
      b={b_mm}
      h={h_mm}
      cover={cover_mm}
      perimDia={perimeter_dia_mm}
      tens1Count={t1?.count ?? 0}
      tens1Dia={t1?.dia_mm ?? 20}
      tens2Count={t2?.count ?? 0}
      tens2Dia={t2?.dia_mm ?? 20}
      comp1Count={compression_count}
      comp1Dia={compression_dia_mm}
      stirrupDia={stirrup_dia_mm}
      stirrupLegs={(stirrup_legs as 2 | 3 | 4 | 6) ?? 2}
      width={width}
      height={height}
    />
  )
}
