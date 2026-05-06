/**
 * Bar bending & splice plan — schematic elevation showing:
 *   • Column joints with 90° hooks (top: down, bottom: up) developing fy
 *     at the far face of the column (ACI 318-19 §25.3 / NSCP §425.3).
 *   • Top hangers (one line per hanger) with ld zone + lap splice.
 *   • Bottom continuous bars (one line per bar) + bent-up bars.
 *   • Tension lap splice ls (Class A or B) staggered.
 *   • Dimension call-outs for ld, ldh, and ls.
 */

export type BarBendDiagramProps = {
  span: number
  h: number
  cover: number
  bendL: number
  ldTop: number
  ldBot: number
  ldhTop: number
  ldhBot: number
  lsTop: number
  lsBot: number
  spliceClass: 'A' | 'B'
  /** Number of top hanger bars (c1 + c2). Defaults to 1 for back-compat. */
  topHangerCount?: number
  /** Number of bottom continuous bars (straight, not bent). Defaults to 1. */
  botBarCount?: number
  /** Number of bent-up truss bars. Defaults to 1. */
  bentBarCount?: number
  width?: number
  height?: number
}

export function BarBendDiagram({
  span,
  bendL,
  ldTop,
  ldBot,
  ldhTop,
  ldhBot,
  lsTop,
  lsBot,
  spliceClass,
  topHangerCount = 1,
  botBarCount = 1,
  bentBarCount = 1,
  width = 860,
  height = 220,
}: BarBendDiagramProps) {
  const colW = 450
  const padL = 70
  const padR = 70
  const padT = 16
  const padB = 30
  const w = width - padL - padR
  const sx = w / span
  const top = padT + 18
  const bot = padT + 18 + (height - padT - padB - 18 - 16)
  const L = padL
  const R = padL + span * sx
  const colHAbove = 38
  const colHBelow = 38
  const colWpx = colW * sx

  const hangerLenL = Math.min(span * 0.45, bendL + 600)
  const hangerLenR = hangerLenL

  const botSpliceX = span * 0.30
  const topSpliceX = hangerLenL - lsTop * 0.6

  const faceL = L + colWpx / 2
  const faceR = R - colWpx / 2
  const farL = L - colWpx / 2
  const farR = R + colWpx / 2
  const colCover = 8
  const tailDepth = Math.max(28, Math.min(60, ldhTop * sx * 0.35))
  const tailUp = Math.max(28, Math.min(60, ldhBot * sx * 0.35))
  const r = 6

  // Stack offsets so multiple top hangers / bottom bars / bent bars
  // are visible
  const stackStep = 3
  const topYs = Array.from({ length: Math.max(1, topHangerCount) }, (_, i) => top + 8 + i * stackStep)
  const botYs = Array.from({ length: Math.max(1, botBarCount) }, (_, i) => bot - 8 - i * stackStep)
  const bentYs = Array.from({ length: Math.max(0, bentBarCount) }, (_, i) => bot - 8 - i * stackStep)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', background: '#fff', border: '1px solid var(--color-line-2)', borderRadius: 4 }}
    >
      {/* Columns (joint blocks) */}
      <rect
        x={L - colWpx / 2}
        y={top - colHAbove}
        width={colWpx}
        height={(bot - top) + colHAbove + colHBelow}
        fill="#E8E3D7"
        stroke="#7A6E5A"
        strokeWidth={1}
      />
      <rect
        x={R - colWpx / 2}
        y={top - colHAbove}
        width={colWpx}
        height={(bot - top) + colHAbove + colHBelow}
        fill="#E8E3D7"
        stroke="#7A6E5A"
        strokeWidth={1}
      />
      <text x={L} y={top - colHAbove - 3} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#6B6058">column i</text>
      <text x={R} y={top - colHAbove - 3} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#6B6058">column j</text>

      {/* Beam */}
      <rect x={L} y={top} width={R - L} height={bot - top} fill="#FAF8F2" stroke="#C9C3B5" strokeWidth={0.8} />

      {/* Column face dashed */}
      <line x1={L + colWpx / 2} y1={top - colHAbove} x2={L + colWpx / 2} y2={bot + colHBelow} stroke="#9A9486" strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={R - colWpx / 2} y1={top - colHAbove} x2={R - colWpx / 2} y2={bot + colHBelow} stroke="#9A9486" strokeWidth={0.6} strokeDasharray="2 2" />

      {/* TOP BAR hooks DOWN inside columns — drawn for the upper-most top bar */}
      <path
        d={`M ${faceL} ${topYs[0]} L ${farL + colCover + r} ${topYs[0]} Q ${farL + colCover} ${topYs[0]} ${farL + colCover} ${topYs[0] + r} L ${farL + colCover} ${topYs[0] + tailDepth}`}
        fill="none"
        stroke="#157A6A"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={farL + colCover} y1={top - 8} x2={faceL} y2={top - 8} stroke="#A12424" strokeWidth={0.6} />
      <line x1={farL + colCover} y1={top - 11} x2={farL + colCover} y2={top - 5} stroke="#A12424" />
      <line x1={faceL} y1={top - 11} x2={faceL} y2={top - 5} stroke="#A12424" />
      <text x={(farL + colCover + faceL) / 2} y={top - 11} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#A12424">
        ldh = {ldhTop}
      </text>
      <text x={farL + colCover + 3} y={topYs[0] + tailDepth + 8} fontFamily="JetBrains Mono" fontSize={7.5} fill="#157A6A">12db</text>

      <path
        d={`M ${faceR} ${topYs[0]} L ${farR - colCover - r} ${topYs[0]} Q ${farR - colCover} ${topYs[0]} ${farR - colCover} ${topYs[0] + r} L ${farR - colCover} ${topYs[0] + tailDepth}`}
        fill="none"
        stroke="#157A6A"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={faceR} y1={top - 8} x2={farR - colCover} y2={top - 8} stroke="#A12424" strokeWidth={0.6} />
      <line x1={faceR} y1={top - 11} x2={faceR} y2={top - 5} stroke="#A12424" />
      <line x1={farR - colCover} y1={top - 11} x2={farR - colCover} y2={top - 5} stroke="#A12424" />
      <text x={(faceR + farR - colCover) / 2} y={top - 11} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#A12424">
        ldh = {ldhTop}
      </text>
      <text x={farR - colCover - 18} y={topYs[0] + tailDepth + 8} fontFamily="JetBrains Mono" fontSize={7.5} fill="#157A6A">12db</text>

      {/* BOTTOM BAR hooks UP — drawn for the lower-most bottom bar */}
      <path
        d={`M ${faceL} ${botYs[0]} L ${farL + colCover + r} ${botYs[0]} Q ${farL + colCover} ${botYs[0]} ${farL + colCover} ${botYs[0] - r} L ${farL + colCover} ${botYs[0] - tailUp}`}
        fill="none"
        stroke="#B06008"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={farL + colCover} y1={bot + 10} x2={faceL} y2={bot + 10} stroke="#A12424" strokeWidth={0.6} />
      <line x1={farL + colCover} y1={bot + 7} x2={farL + colCover} y2={bot + 13} stroke="#A12424" />
      <line x1={faceL} y1={bot + 7} x2={faceL} y2={bot + 13} stroke="#A12424" />
      <text x={(farL + colCover + faceL) / 2} y={bot + 20} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#A12424">
        ldh = {ldhBot}
      </text>
      <text x={farL + colCover + 3} y={botYs[0] - tailUp - 3} fontFamily="JetBrains Mono" fontSize={7.5} fill="#B06008">12db</text>

      <path
        d={`M ${faceR} ${botYs[0]} L ${farR - colCover - r} ${botYs[0]} Q ${farR - colCover} ${botYs[0]} ${farR - colCover} ${botYs[0] - r} L ${farR - colCover} ${botYs[0] - tailUp}`}
        fill="none"
        stroke="#B06008"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={faceR} y1={bot + 10} x2={farR - colCover} y2={bot + 10} stroke="#A12424" strokeWidth={0.6} />
      <line x1={faceR} y1={bot + 7} x2={faceR} y2={bot + 13} stroke="#A12424" />
      <line x1={farR - colCover} y1={bot + 7} x2={farR - colCover} y2={bot + 13} stroke="#A12424" />
      <text x={(faceR + farR - colCover) / 2} y={bot + 20} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#A12424">
        ldh = {ldhBot}
      </text>
      <text x={farR - colCover - 18} y={botYs[0] - tailUp - 3} fontFamily="JetBrains Mono" fontSize={7.5} fill="#B06008">12db</text>

      {/* All top hangers — one line per hanger, stacked down a few px */}
      {topYs.map((y, i) => (
        <g key={`top-${i}`}>
          <line x1={L} y1={y} x2={L + hangerLenL * sx} y2={y} stroke="#157A6A" strokeWidth={i === 0 ? 2 : 1.3} opacity={i === 0 ? 1 : 0.75} />
          <line x1={R - hangerLenR * sx} y1={y} x2={R} y2={y} stroke="#157A6A" strokeWidth={i === 0 ? 2 : 1.3} opacity={i === 0 ? 1 : 0.75} />
        </g>
      ))}
      {topHangerCount > 0 && (
        <>
          <line x1={L + hangerLenL * sx - ldTop * sx} y1={top + 5} x2={L + hangerLenL * sx} y2={top + 5} stroke="#A12424" strokeWidth={0.8} strokeDasharray="2 2" />
          <text x={L + hangerLenL * sx - (ldTop * sx) / 2} y={top - 2} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#A12424">
            ld = {ldTop}
          </text>
          <text x={L + 4} y={topYs[0] - 4} fontFamily="JetBrains Mono" fontSize={9} fill="#157A6A">
            {topHangerCount}× hanger
          </text>
        </>
      )}

      {/* Top hanger lap splice */}
      {topHangerCount > 0 && (
        <>
          <rect x={L + topSpliceX * sx} y={top + 5} width={lsTop * sx} height={6} fill="#FEE7B8" stroke="#B06008" strokeWidth={0.6} />
          <text x={L + (topSpliceX + lsTop / 2) * sx} y={top + 22} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#7A4408">
            ls·{spliceClass} = {lsTop}
          </text>
        </>
      )}

      {/* All bottom continuous bars — one per bar, stacked */}
      {botYs.map((y, i) => (
        <line
          key={`bot-${i}`}
          x1={L}
          y1={y}
          x2={R}
          y2={y}
          stroke="#B06008"
          strokeWidth={i === 0 ? 2 : 1.3}
          opacity={i === 0 ? 1 : 0.75}
        />
      ))}
      {botBarCount > 0 && (
        <text x={L + 4} y={botYs[0] + 12} fontFamily="JetBrains Mono" fontSize={9} fill="#B06008">
          {botBarCount}× bottom
        </text>
      )}

      {/* Bent-up bars — one diagonal per truss bar */}
      {bentYs.map((y, i) => (
        <path
          key={`bent-${i}`}
          d={`M ${L} ${y} L ${L + bendL * sx - 12} ${y} L ${L + bendL * sx + 12} ${top + 12 + i * stackStep} L ${L + (bendL + ldBot) * sx} ${top + 12 + i * stackStep}`}
          fill="none"
          stroke="#B06008"
          strokeWidth={1.3}
          strokeDasharray="4 3"
          opacity={i === 0 ? 0.85 : 0.6}
        />
      ))}
      {bentBarCount > 0 && (
        <>
          <text x={L + bendL * sx} y={bot + 18} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#7A4408">
            bend @ {bendL}
          </text>
          <text x={L + (bendL + ldBot / 2) * sx} y={top + 9} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#A12424">
            ld = {ldBot}
          </text>
          <text x={L + (bendL * sx) / 2} y={bot - 28} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#B06008">
            {bentBarCount}× truss
          </text>
        </>
      )}

      {/* Bottom bar lap splice */}
      {botBarCount > 0 && (
        <>
          <rect x={L + botSpliceX * sx} y={bot - 11} width={lsBot * sx} height={6} fill="#FEE7B8" stroke="#B06008" strokeWidth={0.6} />
          <text x={L + (botSpliceX + lsBot / 2) * sx} y={bot + 18} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#7A4408">
            ls·{spliceClass} = {lsBot}
          </text>
          <line
            x1={L + (botSpliceX + lsBot + 300) * sx}
            y1={bot - 3}
            x2={L + (botSpliceX + lsBot + 300 + lsBot) * sx}
            y2={bot - 3}
            stroke="#B06008"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.6}
          />
          <text
            x={L + (botSpliceX + lsBot + 300 + lsBot / 2) * sx}
            y={bot + 5}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize={8}
            fill="#9A7038"
            opacity={0.85}
          >
            stagger ≥ 0.3·ls
          </text>
        </>
      )}

      {/* Span dim */}
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={L} y1={height - 8} x2={R} y2={height - 8} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={L} y1={height - 11} x2={L} y2={height - 5} stroke="#9CA0A8" />
        <line x1={R} y1={height - 11} x2={R} y2={height - 5} stroke="#9CA0A8" />
        <text x={(L + R) / 2} y={height - 1} textAnchor="middle">L = {span} mm</text>
      </g>

      {/* Side labels */}
      <text x={L - 6} y={topYs[0] + 2} textAnchor="end" fontFamily="JetBrains Mono" fontSize={9} fill="#157A6A">top</text>
      <text x={L - 6} y={botYs[0] + 2} textAnchor="end" fontFamily="JetBrains Mono" fontSize={9} fill="#B06008">bot</text>
    </svg>
  )
}
