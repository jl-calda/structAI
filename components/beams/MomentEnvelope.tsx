/**
 * Moment envelope SVG for a single beam. Two filled curves:
 *   M+ (sagging) above the baseline, filled amber.
 *   M− (hogging) below the baseline, filled blue.
 *
 * Non-interactive — colours fixed by docs/07-design-system.md § SVG.
 */
type Envelope = { x_mm: number; Mpos: number; Mneg: number }

export function MomentEnvelope({
  envelope,
  total_span_mm,
  width = 560,
  height = 180,
  mpos_peak,
  mpos_peak_combo,
  mneg_peak,
  mneg_peak_combo,
}: {
  envelope: Envelope[]
  total_span_mm: number
  width?: number
  height?: number
  mpos_peak: number
  mpos_peak_combo: number | null
  mneg_peak: number
  mneg_peak_combo: number | null
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

  const maxPos = Math.max(mpos_peak, 1)
  const maxNeg = Math.max(mneg_peak, 1)
  const ySpan = maxPos + maxNeg
  const baseline_y = padTop + (maxPos / ySpan) * h
  const ppu_x = w / total_span_mm
  const ppu_pos = (baseline_y - padTop) / maxPos
  const ppu_neg = (padTop + h - baseline_y) / maxNeg

  const posPath = buildFill(
    envelope.map((p) => ({
      x: padL + p.x_mm * ppu_x,
      y: baseline_y - Math.max(0, p.Mpos) * ppu_pos,
    })),
    baseline_y,
  )
  const negPath = buildFill(
    envelope.map((p) => ({
      x: padL + p.x_mm * ppu_x,
      y: baseline_y + Math.max(0, -p.Mneg) * ppu_neg,
    })),
    baseline_y,
  )

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Moment envelope">
      {/* Baseline */}
      <line
        x1={padL} y1={baseline_y} x2={padL + w} y2={baseline_y}
        stroke="#C8C4BE" strokeDasharray="2 3"
      />
      {/* M+ */}
      <path d={posPath} fill="#FEF3E0" stroke="#D4820F" strokeWidth={1} />
      {/* M- */}
      <path d={negPath} fill="#E8F0FC" stroke="#1755A0" strokeWidth={1} />

      {/* Peak labels */}
      <PeakLabel
        x={padL + w / 2}
        y={baseline_y - maxPos * ppu_pos - 6}
        value={mpos_peak}
        combo={mpos_peak_combo}
        tone="#D4820F"
      />
      <PeakLabel
        x={padL + w / 2}
        y={baseline_y + maxNeg * ppu_neg + 12}
        value={-mneg_peak}
        combo={mneg_peak_combo}
        tone="#1755A0"
      />

      {/* Span dimension */}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#6A6560">
        <line x1={padL} y1={height - 12} x2={padL + w} y2={height - 12}
              stroke="#9A9490" strokeWidth={0.7} />
        <line x1={padL} y1={height - 15} x2={padL} y2={height - 9}
              stroke="#9A9490" />
        <line x1={padL + w} y1={height - 15} x2={padL + w} y2={height - 9}
              stroke="#9A9490" />
        <text x={padL + w / 2} y={height - 3} textAnchor="middle">
          {total_span_mm.toFixed(0)} mm
        </text>
      </g>

      {/* Axis label */}
      <text x={6} y={padTop + 8} fontFamily="IBM Plex Sans" fontSize={9}
            fill="#6A6560">
        M (kN·m)
      </text>
    </svg>
  )
}

function buildFill(points: { x: number; y: number }[], baseline: number): string {
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

function PeakLabel({
  x, y, value, combo, tone,
}: {
  x: number
  y: number
  value: number
  combo: number | null
  tone: string
}) {
  return (
    <g fontFamily="IBM Plex Mono" fontSize={10} fill={tone} fontWeight={600}>
      <text x={x} y={y} textAnchor="middle">
        {value.toFixed(1)}
      </text>
      {combo !== null ? (
        <text
          x={x}
          y={y + 10}
          textAnchor="middle"
          fontSize={8}
          fontWeight={400}
          fill="#6A6560"
        >
          combo {combo}
        </text>
      ) : null}
    </g>
  )
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
