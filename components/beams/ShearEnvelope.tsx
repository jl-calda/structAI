/**
 * Shear envelope SVG. Positive V fills red (left end of a typical beam),
 * negative V fills blue (right end). Colours per docs/07-design-system.md.
 */
type Envelope = { x_mm: number; Vpos: number; Vneg: number }

export function ShearEnvelope({
  envelope,
  total_span_mm,
  width = 560,
  height = 180,
  v_peak,
  v_peak_combo,
}: {
  envelope: Envelope[]
  total_span_mm: number
  width?: number
  height?: number
  v_peak: number
  v_peak_combo: number | null
}) {
  if (envelope.length === 0 || total_span_mm <= 0) {
    return <EmptyBox label="No diagram data" width={width} height={height} />
  }

  const padL = 28
  const padR = 16
  const padTop = 22
  const padBot = 26
  const w = width - padL - padR
  const h = height - padTop - padBot

  const maxPos = Math.max(...envelope.map((p) => p.Vpos), 1)
  const maxNeg = Math.max(...envelope.map((p) => Math.max(0, -p.Vneg)), 1)
  const ySpan = maxPos + maxNeg
  const baseline_y = padTop + (maxPos / ySpan) * h
  const ppu_x = w / total_span_mm
  const ppu_pos = (baseline_y - padTop) / maxPos
  const ppu_neg = (padTop + h - baseline_y) / maxNeg

  const posPath = buildFill(
    envelope.map((p) => ({
      x: padL + p.x_mm * ppu_x,
      y: baseline_y - Math.max(0, p.Vpos) * ppu_pos,
    })),
    baseline_y,
  )
  const negPath = buildFill(
    envelope.map((p) => ({
      x: padL + p.x_mm * ppu_x,
      y: baseline_y + Math.max(0, -p.Vneg) * ppu_neg,
    })),
    baseline_y,
  )

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Shear envelope">
      <line
        x1={padL} y1={baseline_y} x2={padL + w} y2={baseline_y}
        stroke="#C8C4BE" strokeDasharray="2 3"
      />
      <path d={posPath} fill="#FDE8E8" stroke="#A02020" strokeWidth={1} />
      <path d={negPath} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1} />

      <text
        x={padL + 2}
        y={baseline_y - maxPos * ppu_pos - 4}
        fontFamily="IBM Plex Mono"
        fontSize={10}
        fill="#A02020"
        fontWeight={600}
      >
        {maxPos.toFixed(1)}
      </text>
      <text
        x={padL + w - 2}
        y={baseline_y + maxNeg * ppu_neg + 12}
        fontFamily="IBM Plex Mono"
        fontSize={10}
        fill="#1755A0"
        fontWeight={600}
        textAnchor="end"
      >
        {(-maxNeg).toFixed(1)}
      </text>

      <text x={6} y={padTop + 8} fontFamily="IBM Plex Sans" fontSize={9}
            fill="#6A6560">
        V (kN)
      </text>
      <text
        x={padL + w / 2}
        y={height - 3}
        fontFamily="IBM Plex Mono"
        fontSize={9}
        fill="#6A6560"
        textAnchor="middle"
      >
        peak {v_peak.toFixed(1)} kN
        {v_peak_combo !== null ? ` · combo ${v_peak_combo}` : ''}
      </text>
    </svg>
  )
}

function buildFill(
  points: { x: number; y: number }[],
  baseline: number,
): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  let d = `M ${first.x} ${baseline} L ${first.x} ${first.y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  d += ` L ${last.x} ${baseline} Z`
  return d
}

function EmptyBox({ label, width, height }: { label: string; width: number; height: number }) {
  return (
    <div
      className="flex items-center justify-center text-[11px]"
      style={{
        width,
        height,
        background: 'var(--color-surface)',
        border: '0.5px dashed var(--color-border)',
        borderRadius: 6,
        color: 'var(--color-text2)',
      }}
    >
      {label}
    </div>
  )
}
