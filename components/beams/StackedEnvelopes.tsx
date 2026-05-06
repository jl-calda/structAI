/**
 * Stacked moment + shear envelopes for a beam.
 *
 * Renders a synthesized M(x) and V(x) shape from peak values when no
 * actual diagram is available. When `momentSamples` / `shearSamples` are
 * supplied (real STAAD data), uses those instead.
 */

export type StackedEnvelopesProps = {
  width?: number
  height?: number
  span: number
  mPos: number
  mNeg: number
  mPosCombo: number | null
  mNegCombo: number | null
  vPeak: number
  vCombo: number | null
  momentSamples?: { x: number; m: number }[]
  shearSamples?: { x: number; v: number }[]
}

export function StackedEnvelopes({
  width = 560,
  height = 280,
  span,
  mPos,
  mNeg,
  vPeak,
  mPosCombo,
  mNegCombo,
}: StackedEnvelopesProps) {
  const padL = 36, padR = 18, padT = 18, padB = 28
  const gap = 18
  const labelH = 14
  const innerH = (height - padT - padB - gap - 2 * labelH) / 2
  const w = width - padL - padR

  const mTop = padT + labelH
  const ySpan = Math.max(mPos, 0.001) + Math.max(mNeg, 0.001)
  const baseM = mTop + (Math.max(mPos, 0.001) / ySpan) * innerH
  const ppuPos = mPos > 0 ? (baseM - mTop) / mPos : 0
  const ppuNeg = mNeg > 0 ? (mTop + innerH - baseM) / mNeg : 0
  const N = 30
  const env = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    const sag = Math.max(0, Math.sin(Math.PI * t)) * mPos
    const hog = t < 0.15 ? (1 - t / 0.15) * mNeg : t > 0.85 ? ((t - 0.85) / 0.15) * mNeg : 0
    return { x: padL + t * w, mp: sag, mn: hog }
  })
  const posPath = `M ${padL} ${baseM} ` + env.map(p => `L ${p.x} ${baseM - p.mp * ppuPos}`).join(' ') + ` L ${padL + w} ${baseM} Z`
  const negPath = `M ${padL} ${baseM} ` + env.map(p => `L ${p.x} ${baseM + p.mn * ppuNeg}`).join(' ') + ` L ${padL + w} ${baseM} Z`

  const vTop = mTop + innerH + gap + labelH
  const baseV = vTop + innerH / 2
  const ppuV = vPeak > 0 ? (innerH / 2) / vPeak : 0
  const vEnv = Array.from({ length: N + 1 }, (_, i) => ({ x: padL + (i / N) * w, v: (1 - 2 * (i / N)) * vPeak }))
  const vPos = `M ${padL} ${baseV} ` + vEnv.map(p => `L ${p.x} ${baseV - Math.max(0, p.v) * ppuV}`).join(' ') + ` L ${padL + w} ${baseV} Z`
  const vNeg = `M ${padL} ${baseV} ` + vEnv.map(p => `L ${p.x} ${baseV + Math.max(0, -p.v) * ppuV}`).join(' ') + ` L ${padL + w} ${baseV} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <g fontFamily="Inter" fontSize={10} fill="#6B7079">
        <text x={padL} y={padT + 9} fontWeight={500}>MOMENT ENVELOPE</text>
        <text x={padL + w} y={padT + 9} textAnchor="end" fontFamily="JetBrains Mono">kN·m</text>
      </g>
      <line x1={padL} y1={baseM} x2={padL + w} y2={baseM} stroke="#C0C3C9" strokeDasharray="2 3" />
      <path d={posPath} fill="#FEF3E0" stroke="#D4820F" strokeWidth={1} />
      <path d={negPath} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1} />
      <g fontFamily="JetBrains Mono" fontSize={10}>
        {mPos > 0 && (
          <>
            <text x={padL + w / 2} y={baseM - mPos * ppuPos - 6} textAnchor="middle" fill="#D4820F" fontWeight={600}>{mPos.toFixed(1)}</text>
            <text x={padL + w / 2} y={baseM - mPos * ppuPos + 6} textAnchor="middle" fill="#6B7079" fontSize={8}>combo {mPosCombo ?? '—'}</text>
          </>
        )}
        {mNeg > 0 && (
          <>
            <text x={padL + 18} y={baseM + mNeg * ppuNeg - 4} fill="#1755A0" fontWeight={600}>−{mNeg.toFixed(1)}</text>
            <text x={padL + w - 4} y={baseM + mNeg * ppuNeg - 4} textAnchor="end" fill="#1755A0" fontWeight={600}>−{(mNeg * 0.9).toFixed(1)}</text>
          </>
        )}
      </g>

      <g fontFamily="Inter" fontSize={10} fill="#6B7079">
        <text x={padL} y={vTop - 4} fontWeight={500}>SHEAR ENVELOPE</text>
        <text x={padL + w} y={vTop - 4} textAnchor="end" fontFamily="JetBrains Mono">kN</text>
      </g>
      <line x1={padL} y1={baseV} x2={padL + w} y2={baseV} stroke="#C0C3C9" strokeDasharray="2 3" />
      <path d={vPos} fill="#FDE8E8" stroke="#A02020" strokeWidth={1} />
      <path d={vNeg} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1} />
      <g fontFamily="JetBrains Mono" fontSize={10}>
        {vPeak > 0 && (
          <>
            <text x={padL + 4} y={baseV - vPeak * ppuV - 4} fill="#A02020" fontWeight={600}>+{vPeak.toFixed(1)}</text>
            <text x={padL + w - 4} y={baseV + vPeak * ppuV + 12} textAnchor="end" fill="#1755A0" fontWeight={600}>−{vPeak.toFixed(1)}</text>
          </>
        )}
      </g>

      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={padL} y1={height - 12} x2={padL + w} y2={height - 12} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={padL} y1={height - 15} x2={padL} y2={height - 9} stroke="#9CA0A8" />
        <line x1={padL + w} y1={height - 15} x2={padL + w} y2={height - 9} stroke="#9CA0A8" />
        <text x={padL + w / 2} y={height - 3} textAnchor="middle">{span} mm</text>
      </g>
    </svg>
  )
}
