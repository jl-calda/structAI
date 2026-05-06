/**
 * Bar bending & splice plan — schematic elevation showing:
 *   • Column joints with 90° hooks (top: down, bottom: up) developing fy
 *     at the far face of the column (ACI 318-19 §25.3 / NSCP §425.3).
 *   • Top hanger with cut-off + lap splice in the low-stress zone.
 *   • Bottom continuous bar with bent-up section at bendL.
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

      {/* TOP BAR hooks DOWN inside columns */}
      <path
        d={`M ${faceL} ${top + 8} L ${farL + colCover + r} ${top + 8} Q ${farL + colCover} ${top + 8} ${farL + colCover} ${top + 8 + r} L ${farL + colCover} ${top + 8 + tailDepth}`}
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
      <text x={farL + colCover + 3} y={top + 8 + tailDepth + 8} fontFamily="JetBrains Mono" fontSize={7.5} fill="#157A6A">12db</text>

      <path
        d={`M ${faceR} ${top + 8} L ${farR - colCover - r} ${top + 8} Q ${farR - colCover} ${top + 8} ${farR - colCover} ${top + 8 + r} L ${farR - colCover} ${top + 8 + tailDepth}`}
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
      <text x={farR - colCover - 18} y={top + 8 + tailDepth + 8} fontFamily="JetBrains Mono" fontSize={7.5} fill="#157A6A">12db</text>

      {/* BOTTOM BAR hooks UP */}
      <path
        d={`M ${faceL} ${bot - 8} L ${farL + colCover + r} ${bot - 8} Q ${farL + colCover} ${bot - 8} ${farL + colCover} ${bot - 8 - r} L ${farL + colCover} ${bot - 8 - tailUp}`}
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
      <text x={farL + colCover + 3} y={bot - 8 - tailUp - 3} fontFamily="JetBrains Mono" fontSize={7.5} fill="#B06008">12db</text>

      <path
        d={`M ${faceR} ${bot - 8} L ${farR - colCover - r} ${bot - 8} Q ${farR - colCover} ${bot - 8} ${farR - colCover} ${bot - 8 - r} L ${farR - colCover} ${bot - 8 - tailUp}`}
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
      <text x={farR - colCover - 18} y={bot - 8 - tailUp - 3} fontFamily="JetBrains Mono" fontSize={7.5} fill="#B06008">12db</text>

      {/* Top hangers */}
      <line x1={L} y1={top + 8} x2={L + hangerLenL * sx} y2={top + 8} stroke="#157A6A" strokeWidth={2} />
      <line x1={R - hangerLenR * sx} y1={top + 8} x2={R} y2={top + 8} stroke="#157A6A" strokeWidth={2} />
      <line x1={L + hangerLenL * sx - ldTop * sx} y1={top + 5} x2={L + hangerLenL * sx} y2={top + 5} stroke="#A12424" strokeWidth={0.8} strokeDasharray="2 2" />
      <text x={L + hangerLenL * sx - (ldTop * sx) / 2} y={top - 2} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#A12424">
        ld = {ldTop}
      </text>

      {/* Top hanger lap splice */}
      <rect x={L + topSpliceX * sx} y={top + 5} width={lsTop * sx} height={6} fill="#FEE7B8" stroke="#B06008" strokeWidth={0.6} />
      <text x={L + (topSpliceX + lsTop / 2) * sx} y={top + 22} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#7A4408">
        ls·{spliceClass} = {lsTop}
      </text>

      {/* Bottom continuous bar */}
      <line x1={L} y1={bot - 8} x2={R} y2={bot - 8} stroke="#B06008" strokeWidth={2} />

      {/* Bottom bar bent-up */}
      <path
        d={`M ${L} ${bot - 8} L ${L + bendL * sx - 12} ${bot - 8} L ${L + bendL * sx + 12} ${top + 12} L ${L + (bendL + ldBot) * sx} ${top + 12}`}
        fill="none"
        stroke="#B06008"
        strokeWidth={1.4}
        strokeDasharray="4 3"
        opacity={0.85}
      />
      <text x={L + bendL * sx} y={bot + 18} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#7A4408">
        bend @ {bendL}
      </text>
      <text x={L + (bendL + ldBot / 2) * sx} y={top + 9} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8.5} fill="#A12424">
        ld = {ldBot}
      </text>

      {/* Bottom bar lap splice */}
      <rect x={L + botSpliceX * sx} y={bot - 11} width={lsBot * sx} height={6} fill="#FEE7B8" stroke="#B06008" strokeWidth={0.6} />
      <text x={L + (botSpliceX + lsBot / 2) * sx} y={bot + 18} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={9} fill="#7A4408">
        ls·{spliceClass} = {lsBot}
      </text>

      {/* Stagger arrow */}
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

      {/* Span dim */}
      <g fontFamily="JetBrains Mono" fontSize={9} fill="#6B7079">
        <line x1={L} y1={height - 8} x2={R} y2={height - 8} stroke="#9CA0A8" strokeWidth={0.6} />
        <line x1={L} y1={height - 11} x2={L} y2={height - 5} stroke="#9CA0A8" />
        <line x1={R} y1={height - 11} x2={R} y2={height - 5} stroke="#9CA0A8" />
        <text x={(L + R) / 2} y={height - 1} textAnchor="middle">L = {span} mm</text>
      </g>

      {/* Side labels */}
      <text x={L - 6} y={top + 10} textAnchor="end" fontFamily="JetBrains Mono" fontSize={9} fill="#157A6A">top</text>
      <text x={L - 6} y={bot - 6} textAnchor="end" fontFamily="JetBrains Mono" fontSize={9} fill="#B06008">bot</text>
    </svg>
  )
}
