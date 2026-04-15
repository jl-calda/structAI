/**
 * P-M interaction diagram. The capacity curve is filled in blue and the
 * design point (Pu, Mu) is marked with an amber dot + dashed lines to
 * the axes. The "balanced" (tension-controlled corner, ε_t = 0.005) is
 * marked as an open circle.
 */
export type PmCurvePoint = {
  phi_Pn_kN: number
  phi_Mn_kNm: number
  eps_t: number
}

export function PmDiagram({
  curve,
  Pu_kN,
  Mu_kNm,
  width = 520,
  height = 320,
}: {
  curve: PmCurvePoint[]
  Pu_kN: number
  Mu_kNm: number
  width?: number
  height?: number
}) {
  if (curve.length === 0) {
    return <EmptyBox width={width} height={height} />
  }

  const padL = 44
  const padR = 16
  const padTop = 20
  const padBot = 34
  const plotW = width - padL - padR
  const plotH = height - padTop - padBot

  const maxM = Math.max(...curve.map((p) => p.phi_Mn_kNm), Math.abs(Mu_kNm), 1)
  const maxP = Math.max(...curve.map((p) => p.phi_Pn_kN), Pu_kN, 1)
  const minP = Math.min(...curve.map((p) => p.phi_Pn_kN), 0)

  const xAt = (m: number) => padL + (m / maxM) * plotW
  const yAt = (p: number) => padTop + ((maxP - p) / (maxP - minP)) * plotH

  // Close the curve: add (0, minP) at the far end so the fill has a
  // clean bottom edge from the last curve sample back to the Pn axis.
  const sorted = [...curve].sort((a, b) => b.phi_Pn_kN - a.phi_Pn_kN)
  const pathD =
    sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.phi_Mn_kNm)} ${yAt(p.phi_Pn_kN)}`).join(' ') +
    ` L ${xAt(0)} ${yAt(sorted[sorted.length - 1].phi_Pn_kN)} L ${xAt(0)} ${yAt(sorted[0].phi_Pn_kN)} Z`

  // Balanced-ish point = the curve sample whose ε_t is closest to 0.002
  // (compression-controlled limit, the kink in ACI's φ transition).
  let balanced = sorted[0]
  let bestDelta = Infinity
  for (const p of sorted) {
    const d = Math.abs(p.eps_t - 0.002)
    if (d < bestDelta) {
      bestDelta = d
      balanced = p
    }
  }

  const Mu_abs = Math.abs(Mu_kNm)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="P-M interaction diagram"
    >
      {/* Grid — vertical */}
      {Array.from({ length: 5 }).map((_, i) => {
        const x = padL + (plotW * i) / 4
        return (
          <line key={`v${i}`}
                x1={x} y1={padTop}
                x2={x} y2={padTop + plotH}
                stroke="#DDD8CE" strokeWidth={0.5} />
        )
      })}
      {/* Grid — horizontal */}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = padTop + (plotH * i) / 4
        return (
          <line key={`h${i}`}
                x1={padL} y1={y}
                x2={padL + plotW} y2={y}
                stroke="#DDD8CE" strokeWidth={0.5} />
        )
      })}

      {/* Axes */}
      <line x1={padL} y1={padTop}
            x2={padL} y2={padTop + plotH}
            stroke="#6A6560" strokeWidth={0.7} />
      <line x1={padL} y1={yAt(0)}
            x2={padL + plotW} y2={yAt(0)}
            stroke="#6A6560" strokeWidth={0.7} />

      {/* Curve fill */}
      <path d={pathD} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1.2} />

      {/* Balanced marker (open circle) */}
      <circle
        cx={xAt(balanced.phi_Mn_kNm)}
        cy={yAt(balanced.phi_Pn_kN)}
        r={4}
        fill="#fff"
        stroke="#1755A0"
        strokeWidth={1.2}
      />

      {/* Demand point (Pu, Mu) */}
      <line
        x1={padL}
        y1={yAt(Pu_kN)}
        x2={xAt(Mu_abs)}
        y2={yAt(Pu_kN)}
        stroke="#D4820F"
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      <line
        x1={xAt(Mu_abs)}
        y1={yAt(0)}
        x2={xAt(Mu_abs)}
        y2={yAt(Pu_kN)}
        stroke="#D4820F"
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      <circle
        cx={xAt(Mu_abs)}
        cy={yAt(Pu_kN)}
        r={4}
        fill="#D4820F"
        stroke="#8B5000"
        strokeWidth={0.8}
      />

      {/* Axis labels */}
      <g fontFamily="IBM Plex Sans" fontSize={9} fill="#6A6560">
        <text x={8} y={padTop + 8}>P (kN)</text>
        <text x={padL + plotW - 2} y={height - 8} textAnchor="end">M (kN·m)</text>
        <text x={padL - 6} y={yAt(maxP) + 3} textAnchor="end" fontFamily="IBM Plex Mono">
          {maxP.toFixed(0)}
        </text>
        <text x={padL - 6} y={yAt(0) + 3} textAnchor="end" fontFamily="IBM Plex Mono">
          0
        </text>
        {minP < 0 ? (
          <text x={padL - 6} y={yAt(minP) + 3} textAnchor="end" fontFamily="IBM Plex Mono">
            {minP.toFixed(0)}
          </text>
        ) : null}
        <text x={padL + plotW} y={padTop + plotH + 14} textAnchor="end" fontFamily="IBM Plex Mono">
          {maxM.toFixed(0)}
        </text>
      </g>

      {/* Demand annotation */}
      <g fontFamily="IBM Plex Mono" fontSize={10} fill="#8B5000">
        <text
          x={xAt(Mu_abs) + 6}
          y={yAt(Pu_kN) - 4}
        >
          Pu={Pu_kN.toFixed(0)} Mu={Mu_abs.toFixed(0)}
        </text>
      </g>
    </svg>
  )
}

function EmptyBox({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="flex items-center justify-center text-[11px]"
      style={{
        width, height,
        background: 'var(--color-surface)',
        border: '0.5px dashed var(--color-border)',
        borderRadius: 6,
        color: 'var(--color-text2)',
      }}
    >
      No interaction curve — run the design.
    </div>
  )
}
