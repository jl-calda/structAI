/**
 * Beam elevation SVG — outline, support triangles, stirrup zones, the
 * 2 continuous perimeter lines top/bottom, and bent-down tension bars
 * that dip at 45° past the bend points.
 */
import type { BeamStirrupZone, BeamTensionLayer } from '@/lib/supabase/types'

export function BeamElevation({
  total_span_mm,
  h_mm,
  stirrup_zones,
  tension_layers,
  bend_point_left_mm,
  bend_point_right_mm,
  width = 600,
  height = 190,
}: {
  total_span_mm: number
  h_mm: number
  stirrup_zones: BeamStirrupZone[]
  tension_layers: BeamTensionLayer[]
  bend_point_left_mm: number
  bend_point_right_mm: number
  width?: number
  height?: number
}) {
  const padL = 24
  const padR = 24
  const padTop = 24
  const padBot = 42
  const w = width - padL - padR
  const h = height - padTop - padBot
  const scaleX = total_span_mm > 0 ? w / total_span_mm : 1
  const scaleY = h_mm > 0 ? h / h_mm : 1

  const beamTop = padTop
  const beamBottom = padTop + h_mm * scaleY
  const beamLeft = padL
  const beamRight = padL + total_span_mm * scaleX

  // Perimeter lines offset in from the face (~cover equivalent).
  const perimInset = 8
  const topBarY = beamTop + perimInset
  const botBarY = beamBottom - perimInset
  const compressionY = beamTop + perimInset + 6

  // Stirrups — render at spacing within each zone.
  const stirrups: number[] = []
  for (const z of stirrup_zones) {
    if (z.spacing_mm <= 0) continue
    for (let x = z.start_mm; x <= z.end_mm; x += z.spacing_mm) {
      stirrups.push(x)
    }
  }

  const bendL_x = beamLeft + bend_point_left_mm * scaleX
  const bendR_x = beamLeft + bend_point_right_mm * scaleX

  const hasBentDown = tension_layers.some((l) => l.bent_down && l.count > 0)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
         role="img" aria-label="Beam elevation">
      {/* Concrete outline */}
      <rect
        x={beamLeft} y={beamTop}
        width={beamRight - beamLeft} height={beamBottom - beamTop}
        fill="#E8E4DC" stroke="#4A4038" strokeWidth={2}
      />

      {/* Stirrup verticals */}
      {stirrups.map((x, i) => {
        const xPx = beamLeft + x * scaleX
        return (
          <line
            key={i}
            x1={xPx} y1={beamTop + 4}
            x2={xPx} y2={beamBottom - 4}
            stroke="#1755A0"
            strokeWidth={0.7}
          />
        )
      })}

      {/* Continuous perimeter bars — top and bottom (2 lines each) */}
      <line x1={beamLeft} y1={topBarY} x2={beamRight} y2={topBarY}
            stroke="#D4820F" strokeWidth={1.2} />
      <line x1={beamLeft} y1={topBarY + 3} x2={beamRight} y2={topBarY + 3}
            stroke="#D4820F" strokeWidth={1.2} />
      <line x1={beamLeft} y1={botBarY} x2={beamRight} y2={botBarY}
            stroke="#D4820F" strokeWidth={1.2} />
      <line x1={beamLeft} y1={botBarY - 3} x2={beamRight} y2={botBarY - 3}
            stroke="#D4820F" strokeWidth={1.2} />

      {/* Compression bar (if any) */}
      {tension_layers.some((l) => l.bent_down) ? (
        <line x1={beamLeft} y1={compressionY} x2={beamRight} y2={compressionY}
              stroke="#157A6A" strokeWidth={1.1} />
      ) : null}

      {/* Bent-down additional bar — a single representative diagonal
          at each support (45°). The real bar count is in the
          cross-section and MTO. */}
      {hasBentDown ? (
        <>
          <path
            d={`M ${beamLeft + 4} ${botBarY - 4} L ${bendL_x} ${botBarY - 4}
                L ${bendL_x + 12} ${topBarY + 4}
                L ${beamRight - 4} ${topBarY + 4}`}
            fill="none" stroke="#B06008" strokeWidth={1.4}
          />
          <path
            d={`M ${beamLeft + 4} ${topBarY + 4} L ${bendR_x - 12} ${topBarY + 4}
                L ${bendR_x} ${botBarY - 4}
                L ${beamRight - 4} ${botBarY - 4}`}
            fill="none" stroke="#B06008" strokeWidth={1.4}
          />
          {/* Red tick marks at bend points */}
          <BendTick x={bendL_x} y={botBarY - 4} />
          <BendTick x={bendR_x} y={botBarY - 4} />
        </>
      ) : null}

      {/* Support triangles */}
      <polygon
        points={`${beamLeft - 6},${beamBottom + 12}
                 ${beamLeft + 6},${beamBottom + 12}
                 ${beamLeft},${beamBottom}`}
        fill="#4A4038"
      />
      <polygon
        points={`${beamRight - 6},${beamBottom + 12}
                 ${beamRight + 6},${beamBottom + 12}
                 ${beamRight},${beamBottom}`}
        fill="#4A4038"
      />

      {/* Span dimension */}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="#6A6560">
        <line
          x1={beamLeft} y1={height - 12}
          x2={beamRight} y2={height - 12}
          stroke="#9A9490" strokeWidth={0.7}
        />
        <line x1={beamLeft} y1={height - 15} x2={beamLeft} y2={height - 9}
              stroke="#9A9490" />
        <line x1={beamRight} y1={height - 15} x2={beamRight} y2={height - 9}
              stroke="#9A9490" />
        <text x={beamLeft + (beamRight - beamLeft) / 2} y={height - 3}
              textAnchor="middle">
          L = {total_span_mm.toFixed(0)} mm
        </text>
      </g>

      {/* Bend point labels */}
      {hasBentDown ? (
        <g fontFamily="IBM Plex Mono" fontSize={8} fill="#A02020">
          <text x={bendL_x} y={beamTop - 6} textAnchor="middle">
            lb = {bend_point_left_mm.toFixed(0)} mm
          </text>
          <text
            x={bendR_x}
            y={beamTop - 6}
            textAnchor="middle"
          >
            lb = {(total_span_mm - bend_point_right_mm).toFixed(0)} mm
          </text>
        </g>
      ) : null}
    </svg>
  )
}

function BendTick({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="#A02020" strokeWidth={1.4}>
      <line x1={x - 3} y1={y - 4} x2={x + 3} y2={y + 4} />
      <line x1={x - 3} y1={y + 4} x2={x + 3} y2={y - 4} />
    </g>
  )
}
