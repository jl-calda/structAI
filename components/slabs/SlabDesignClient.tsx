'use client'

/**
 * SlabDesignClient — interactive 7-step slab design page.
 *
 * All engineering calculations are client-side via CodeProvider.
 * Coefficient method (ACI Method 2) for two-way slabs.
 * Steps: 1b Edge Conditions · 2 Reinforcement · 3 Design Forces ·
 *        4 Plan & Section · 4b Dev & Splice · 5 Calc Breakdown · 6 MTO
 */

import { useMemo, useState } from 'react'

// Side-effect: register code providers in the client bundle
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode, type CodeProvider, type CodeStandard } from '@/lib/engineering/codes'
import type { Database } from '@/lib/supabase/types'

type SlabCheckRow = Database['public']['Tables']['slab_checks']['Row']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SlabDesignClientProps = {
  initial: {
    label: string
    spanX: number; spanY: number; thickness: number; cover: number
    fc: number; fy: number
    dlSelf: number; sdl: number; ll: number
    slabType: 'one_way' | 'two_way' | 'flat_plate' | 'flat_slab'
  }
  code_standard: CodeStandard
  checks: SlabCheckRow | null
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PI = Math.PI
const A = (d: number) => (PI * d * d) / 4
const AsPer = (dia: number, s: number) => s > 0 ? A(dia) * (1000 / s) : 0
const fmt = (n: number, dp = 1) => n.toFixed(dp)
const fmt0 = (n: number) => n.toFixed(0)

const BAR_DIAS = [10, 12, 16, 20, 25] as const
const SPACINGS = [100, 125, 150, 175, 200, 250, 300] as const

type EdgeSide = 'C' | 'D'
type EdgeConfig = { N: EdgeSide; S: EdgeSide; E: EdgeSide; W: EdgeSide }

// ACI Method 2 — 9 standard panel cases
const EDGE_CONFIG: Record<number, EdgeConfig> = {
  1: { N: 'C', S: 'C', E: 'C', W: 'C' },
  2: { N: 'C', S: 'C', E: 'C', W: 'D' },
  3: { N: 'C', S: 'D', E: 'C', W: 'D' },
  4: { N: 'C', S: 'C', E: 'D', W: 'D' },
  5: { N: 'C', S: 'D', E: 'D', W: 'D' },
  6: { N: 'D', S: 'D', E: 'C', W: 'D' },
  7: { N: 'D', S: 'D', E: 'D', W: 'D' },
  8: { N: 'C', S: 'D', E: 'C', W: 'C' },
  9: { N: 'D', S: 'D', E: 'C', W: 'C' },
}

// Coefficient tables for cases 1,4,8,9 — representative set.
// Each entry is [m, Ca_neg, Cb_neg, Ca_DL, Cb_DL, Ca_LL, Cb_LL]
// m = la / lb. Interpolation is used for intermediate m values.
type CoefEntry = [number, number, number, number, number, number, number]

const COEF_TABLES: Record<number, CoefEntry[]> = {
  1: [
    [0.50, 0.083, 0.000, 0.020, 0.013, 0.028, 0.013],
    [0.55, 0.074, 0.000, 0.022, 0.014, 0.031, 0.014],
    [0.60, 0.066, 0.000, 0.025, 0.015, 0.035, 0.015],
    [0.65, 0.059, 0.000, 0.028, 0.016, 0.040, 0.016],
    [0.70, 0.053, 0.000, 0.031, 0.017, 0.044, 0.017],
    [0.75, 0.047, 0.000, 0.033, 0.018, 0.048, 0.018],
    [0.80, 0.042, 0.000, 0.036, 0.019, 0.052, 0.019],
    [0.85, 0.037, 0.000, 0.038, 0.020, 0.056, 0.020],
    [0.90, 0.033, 0.000, 0.040, 0.021, 0.059, 0.021],
    [0.95, 0.029, 0.000, 0.042, 0.022, 0.062, 0.022],
    [1.00, 0.033, 0.033, 0.040, 0.040, 0.059, 0.059],
  ],
  4: [
    [0.50, 0.089, 0.000, 0.022, 0.014, 0.031, 0.014],
    [0.55, 0.080, 0.000, 0.025, 0.015, 0.035, 0.015],
    [0.60, 0.071, 0.000, 0.029, 0.016, 0.039, 0.016],
    [0.65, 0.063, 0.000, 0.032, 0.017, 0.043, 0.017],
    [0.70, 0.056, 0.000, 0.036, 0.018, 0.047, 0.018],
    [0.75, 0.050, 0.000, 0.039, 0.019, 0.051, 0.019],
    [0.80, 0.044, 0.000, 0.041, 0.020, 0.055, 0.020],
    [0.85, 0.039, 0.000, 0.044, 0.021, 0.059, 0.021],
    [0.90, 0.035, 0.000, 0.046, 0.022, 0.062, 0.022],
    [0.95, 0.031, 0.000, 0.049, 0.023, 0.065, 0.023],
    [1.00, 0.035, 0.035, 0.046, 0.046, 0.062, 0.062],
  ],
  8: [
    [0.50, 0.074, 0.000, 0.018, 0.012, 0.025, 0.012],
    [0.55, 0.066, 0.000, 0.020, 0.013, 0.028, 0.013],
    [0.60, 0.059, 0.000, 0.023, 0.014, 0.031, 0.014],
    [0.65, 0.053, 0.000, 0.025, 0.015, 0.035, 0.015],
    [0.70, 0.047, 0.000, 0.028, 0.016, 0.039, 0.016],
    [0.75, 0.042, 0.000, 0.030, 0.017, 0.042, 0.017],
    [0.80, 0.037, 0.000, 0.032, 0.018, 0.045, 0.018],
    [0.85, 0.033, 0.000, 0.034, 0.019, 0.048, 0.019],
    [0.90, 0.030, 0.000, 0.036, 0.020, 0.051, 0.020],
    [0.95, 0.027, 0.000, 0.038, 0.021, 0.054, 0.021],
    [1.00, 0.030, 0.030, 0.036, 0.036, 0.051, 0.051],
  ],
  9: [
    [0.50, 0.085, 0.000, 0.021, 0.013, 0.029, 0.013],
    [0.55, 0.076, 0.000, 0.024, 0.014, 0.033, 0.014],
    [0.60, 0.067, 0.000, 0.027, 0.015, 0.037, 0.015],
    [0.65, 0.060, 0.000, 0.030, 0.016, 0.041, 0.016],
    [0.70, 0.053, 0.000, 0.033, 0.017, 0.045, 0.017],
    [0.75, 0.047, 0.000, 0.036, 0.018, 0.049, 0.018],
    [0.80, 0.042, 0.000, 0.038, 0.019, 0.052, 0.019],
    [0.85, 0.037, 0.000, 0.040, 0.020, 0.055, 0.020],
    [0.90, 0.033, 0.000, 0.043, 0.021, 0.058, 0.021],
    [0.95, 0.030, 0.000, 0.045, 0.022, 0.061, 0.022],
    [1.00, 0.033, 0.033, 0.043, 0.043, 0.058, 0.058],
  ],
}

/** Linearly interpolate a coefficient from the table for a given case and m value. */
function lookupCoef(caseN: number, m: number): {
  Ca_neg: number; Cb_neg: number
  Ca_DL: number; Cb_DL: number
  Ca_LL: number; Cb_LL: number
} {
  const table = COEF_TABLES[caseN] ?? COEF_TABLES[1]!
  const mc = Math.max(0.5, Math.min(1.0, m))
  // Find bracketing rows
  let lo = table[0]!
  let hi = table[table.length - 1]!
  for (let i = 0; i < table.length - 1; i++) {
    if (mc >= table[i]![0] && mc <= table[i + 1]![0]) {
      lo = table[i]!
      hi = table[i + 1]!
      break
    }
  }
  const t = hi[0] === lo[0] ? 0 : (mc - lo[0]) / (hi[0] - lo[0])
  const interp = (li: number, hi2: number) => li + t * (hi2 - li)
  return {
    Ca_neg: interp(lo[1], hi[1]),
    Cb_neg: interp(lo[2], hi[2]),
    Ca_DL:  interp(lo[3], hi[3]),
    Cb_DL:  interp(lo[4], hi[4]),
    Ca_LL:  interp(lo[5], hi[5]),
    Cb_LL:  interp(lo[6], hi[6]),
  }
}

/** Compute As required from Mu, fc, fy, d (per metre strip). Uses α₁ = stress_block_stress_factor. */
function AsRequired(Mu_kNm: number, fc: number, fy: number, d: number, alpha1 = 0.85): number {
  if (Mu_kNm <= 0 || d <= 0) return 0
  const Rn = (Mu_kNm * 1e6) / (0.9 * 1000 * d * d)
  const ratio = (2 * Rn) / (alpha1 * fc)
  if (ratio >= 1) return Infinity
  const rho = (alpha1 * fc / fy) * (1 - Math.sqrt(1 - ratio))
  return rho * 1000 * d
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 26x26 SVG thumbnail showing edge continuity conditions. */
function EdgeCaseIcon({
  caseN,
  active,
  onClick,
}: {
  caseN: number
  active: boolean
  onClick: () => void
}) {
  const cfg = EDGE_CONFIG[caseN]!
  const S = 26
  const m = 3 // margin
  const dash = '2,2'
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: S + 8, height: S + 8, padding: 4,
        border: active ? '2px solid var(--color-sel)' : '1px solid var(--color-line-2)',
        borderRadius: 4, background: active ? 'var(--color-bg)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      title={`Case ${caseN}`}
    >
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <rect x={m} y={m} width={S - 2 * m} height={S - 2 * m} fill="#E8E4DC" stroke="none" />
        {/* N (top) */}
        <line x1={m} y1={m} x2={S - m} y2={m}
          stroke="#4A4038" strokeWidth={cfg.N === 'C' ? 2 : 1}
          strokeDasharray={cfg.N === 'D' ? dash : 'none'} />
        {/* S (bottom) */}
        <line x1={m} y1={S - m} x2={S - m} y2={S - m}
          stroke="#4A4038" strokeWidth={cfg.S === 'C' ? 2 : 1}
          strokeDasharray={cfg.S === 'D' ? dash : 'none'} />
        {/* W (left) */}
        <line x1={m} y1={m} x2={m} y2={S - m}
          stroke="#4A4038" strokeWidth={cfg.W === 'C' ? 2 : 1}
          strokeDasharray={cfg.W === 'D' ? dash : 'none'} />
        {/* E (right) */}
        <line x1={S - m} y1={m} x2={S - m} y2={S - m}
          stroke="#4A4038" strokeWidth={cfg.E === 'C' ? 2 : 1}
          strokeDasharray={cfg.E === 'D' ? dash : 'none'} />
        <text x={S / 2} y={S / 2 + 3.5} textAnchor="middle" fontSize={8}
          fontFamily="IBM Plex Mono" fill="#4A4038">{caseN}</text>
      </svg>
    </button>
  )
}

/** Rebar plan view SVG showing bottom mat and top bars at continuous edges. */
function SlabPlanRebar({
  la, lb, t,
  aBotDia, aBotSpacing,
  bBotDia, bBotSpacing,
  aTopDia, aTopSpacing,
  bTopDia, bTopSpacing,
  edges,
  layer,
}: {
  la: number; lb: number; t: number
  aBotDia: number; aBotSpacing: number
  bBotDia: number; bBotSpacing: number
  aTopDia: number; aTopSpacing: number
  bTopDia: number; bTopSpacing: number
  edges: EdgeConfig
  layer: 'bot' | 'top' | 'both'
}) {
  const W = 360, H = 320, pad = 40
  const drawW = W - 2 * pad, drawH = H - 2 * pad
  const scale = Math.min(drawW / la, drawH / lb)
  const w = la * scale, h = lb * scale
  const x0 = (W - w) / 2, y0 = (H - h) / 2
  const topExt = (la / 4) * scale // top bar extension = span/4

  const showBot = layer === 'bot' || layer === 'both'
  const showTop = layer === 'top' || layer === 'both'

  // Bottom short bars (A-dir) = vertical lines (orange)
  const aBotCount = aBotSpacing > 0 ? Math.max(2, Math.floor(lb / aBotSpacing) + 1) : 0
  // Bottom long bars (B-dir) = horizontal lines
  const bBotCount = bBotSpacing > 0 ? Math.max(2, Math.floor(la / bBotSpacing) + 1) : 0

  // Top bar extensions at continuous edges
  const topExtA = (la / 4) * scale
  const topExtB = (lb / 4) * scale

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Slab outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#E8E4DC" stroke="none" />
      {/* Edge lines */}
      {/* N */}
      <line x1={x0} y1={y0} x2={x0 + w} y2={y0}
        stroke="#4A4038" strokeWidth={2}
        strokeDasharray={edges.N === 'D' ? '4,3' : 'none'} />
      {/* S */}
      <line x1={x0} y1={y0 + h} x2={x0 + w} y2={y0 + h}
        stroke="#4A4038" strokeWidth={2}
        strokeDasharray={edges.S === 'D' ? '4,3' : 'none'} />
      {/* W */}
      <line x1={x0} y1={y0} x2={x0} y2={y0 + h}
        stroke="#4A4038" strokeWidth={2}
        strokeDasharray={edges.W === 'D' ? '4,3' : 'none'} />
      {/* E */}
      <line x1={x0 + w} y1={y0} x2={x0 + w} y2={y0 + h}
        stroke="#4A4038" strokeWidth={2}
        strokeDasharray={edges.E === 'D' ? '4,3' : 'none'} />

      {/* Bottom short bars (A-dir) — vertical lines in orange */}
      {showBot && Array.from({ length: aBotCount }).map((_, i) => {
        const py = y0 + (h / Math.max(1, aBotCount - 1)) * i
        return (
          <line key={`abs-${i}`}
            x1={x0 + 4} y1={py} x2={x0 + w - 4} y2={py}
            stroke="#B06008" strokeWidth={0.8} />
        )
      })}
      {/* Bottom long bars (B-dir) — vertical lines in lighter amber */}
      {showBot && Array.from({ length: bBotCount }).map((_, i) => {
        const px = x0 + (w / Math.max(1, bBotCount - 1)) * i
        return (
          <line key={`bbl-${i}`}
            x1={px} y1={y0 + 4} x2={px} y2={y0 + h - 4}
            stroke="#D4820F" strokeWidth={0.6} />
        )
      })}

      {/* Top bars at continuous edges (blue) — extend span/4 from edge */}
      {showTop && edges.N === 'C' && (() => {
        const cnt = aTopSpacing > 0 ? Math.max(2, Math.floor(la / aTopSpacing) + 1) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const px = x0 + (w / Math.max(1, cnt - 1)) * i
          return (
            <line key={`tn-${i}`}
              x1={px} y1={y0} x2={px} y2={y0 + topExtB}
              stroke="#1755A0" strokeWidth={1} />
          )
        })
      })()}
      {showTop && edges.S === 'C' && (() => {
        const cnt = aTopSpacing > 0 ? Math.max(2, Math.floor(la / aTopSpacing) + 1) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const px = x0 + (w / Math.max(1, cnt - 1)) * i
          return (
            <line key={`ts-${i}`}
              x1={px} y1={y0 + h} x2={px} y2={y0 + h - topExtB}
              stroke="#1755A0" strokeWidth={1} />
          )
        })
      })()}
      {showTop && edges.W === 'C' && (() => {
        const cnt = bTopSpacing > 0 ? Math.max(2, Math.floor(lb / bTopSpacing) + 1) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const py = y0 + (h / Math.max(1, cnt - 1)) * i
          return (
            <line key={`tw-${i}`}
              x1={x0} y1={py} x2={x0 + topExtA} y2={py}
              stroke="#2A6FDB" strokeWidth={1} />
          )
        })
      })()}
      {showTop && edges.E === 'C' && (() => {
        const cnt = bTopSpacing > 0 ? Math.max(2, Math.floor(lb / bTopSpacing) + 1) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const py = y0 + (h / Math.max(1, cnt - 1)) * i
          return (
            <line key={`te-${i}`}
              x1={x0 + w} y1={py} x2={x0 + w - topExtA} y2={py}
              stroke="#2A6FDB" strokeWidth={1} />
          )
        })
      })()}

      {/* Labels */}
      <g fontFamily="IBM Plex Mono" fontSize={9} fill="var(--color-ink-3)">
        <text x={x0 + w / 2} y={y0 - 10} textAnchor="middle">
          la = {fmt0(la)} mm (short)
        </text>
        <text x={x0 + w + 8} y={y0 + h / 2} dominantBaseline="middle" fontSize={8}>
          lb = {fmt0(lb)} mm
        </text>
      </g>
    </svg>
  )
}

/** Coefficient lookup table display */
function CoefTable({
  coefs,
  Ma_neg, Mb_neg, Ma_pos, Mb_pos,
  wu, la_m, lb_m,
}: {
  coefs: ReturnType<typeof lookupCoef>
  Ma_neg: number; Mb_neg: number
  Ma_pos: number; Mb_pos: number
  wu: number; la_m: number; lb_m: number
}) {
  const rows: [string, string, string][] = [
    ['Ca,neg', fmt(coefs.Ca_neg, 4), `${fmt(Ma_neg)} kN·m/m`],
    ['Cb,neg', fmt(coefs.Cb_neg, 4), `${fmt(Mb_neg)} kN·m/m`],
    ['Ca,DL',  fmt(coefs.Ca_DL, 4),  ''],
    ['Ca,LL',  fmt(coefs.Ca_LL, 4),  `Ma,pos = ${fmt(Ma_pos)} kN·m/m`],
    ['Cb,DL',  fmt(coefs.Cb_DL, 4),  ''],
    ['Cb,LL',  fmt(coefs.Cb_LL, 4),  `Mb,pos = ${fmt(Mb_pos)} kN·m/m`],
  ]
  return (
    <table className="t" style={{ fontSize: 11, width: '100%' }}>
      <thead>
        <tr>
          <th>Coef.</th>
          <th style={{ textAlign: 'right' }}>Value</th>
          <th style={{ textAlign: 'right' }}>Moment</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, val, mom], i) => (
          <tr key={i}>
            <td className="mono">{label}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{val}</td>
            <td className="mono" style={{ textAlign: 'right', color: mom ? 'var(--color-sel)' : 'inherit' }}>{mom}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Moment field heatmap: 16x16 grid, blue=negative, orange=positive */
function SlabMomentField({
  edges,
  Ma_neg, Mb_neg, Ma_pos, Mb_pos,
}: {
  edges: EdgeConfig
  Ma_neg: number; Mb_neg: number
  Ma_pos: number; Mb_pos: number
}) {
  const N = 16, W = 260, H = 260
  const cw = W / N, ch = H / N
  const maxM = Math.max(Ma_neg, Mb_neg, Ma_pos, Mb_pos, 0.001)

  // Simple bilinear moment field approximation
  const cellColor = (ix: number, iy: number) => {
    const fx = ix / (N - 1) // 0..1 across short span
    const fy = iy / (N - 1) // 0..1 across long span
    // Distance from edges — continuous edges produce negative moments
    const dN = edges.N === 'C' ? fy : 1
    const dS = edges.S === 'C' ? (1 - fy) : 1
    const dW = edges.W === 'C' ? fx : 1
    const dE = edges.E === 'C' ? (1 - fx) : 1
    const dMin = Math.min(dN, dS, dW, dE)
    // Near continuous edge → negative (blue), otherwise positive (orange)
    if (dMin < 0.2) {
      const intensity = (1 - dMin / 0.2) * 0.7
      const r = Math.round(23 + (232 - 23) * (1 - intensity))
      const g = Math.round(85 + (240 - 85) * (1 - intensity))
      const b = Math.round(160 + (252 - 160) * (1 - intensity))
      return `rgb(${r},${g},${b})`
    }
    // Midspan positive
    const cx = Math.abs(fx - 0.5) * 2
    const cy = Math.abs(fy - 0.5) * 2
    const dist = Math.sqrt(cx * cx + cy * cy) / Math.SQRT2
    const intensity = (1 - dist) * 0.5
    const r = Math.round(254 - (254 - 212) * intensity)
    const g = Math.round(243 - (243 - 130) * intensity)
    const bb = Math.round(224 - (224 - 15) * intensity)
    return `rgb(${r},${g},${bb})`
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {Array.from({ length: N }).map((_, iy) =>
        Array.from({ length: N }).map((_, ix) => (
          <rect key={`${ix}-${iy}`}
            x={ix * cw} y={iy * ch} width={cw + 0.5} height={ch + 0.5}
            fill={cellColor(ix, iy)} />
        ))
      )}
      {/* Center-strip polylines — horizontal (A-dir) */}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2}
        stroke="#4A4038" strokeWidth={0.5} strokeDasharray="3,2" />
      <line x1={W / 2} y1={0} x2={W / 2} y2={H}
        stroke="#4A4038" strokeWidth={0.5} strokeDasharray="3,2" />
      {/* Labels */}
      <text x={W / 2} y={H / 2 - 6} textAnchor="middle"
        fontFamily="IBM Plex Mono" fontSize={8} fill="#4A4038">
        M+ zone
      </text>
      {edges.N === 'C' && (
        <text x={W / 2} y={14} textAnchor="middle"
          fontFamily="IBM Plex Mono" fontSize={7} fill="#1755A0">M-</text>
      )}
      {edges.S === 'C' && (
        <text x={W / 2} y={H - 6} textAnchor="middle"
          fontFamily="IBM Plex Mono" fontSize={7} fill="#1755A0">M-</text>
      )}
      {edges.W === 'C' && (
        <text x={10} y={H / 2} textAnchor="start" dominantBaseline="middle"
          fontFamily="IBM Plex Mono" fontSize={7} fill="#1755A0">M-</text>
      )}
      {edges.E === 'C' && (
        <text x={W - 10} y={H / 2} textAnchor="end" dominantBaseline="middle"
          fontFamily="IBM Plex Mono" fontSize={7} fill="#1755A0">M-</text>
      )}
    </svg>
  )
}

/** Full bay plan SVG with bottom mat, top mat, section cut markers, corners, dims */
function SlabFullPlan({
  la, lb, t,
  aBotDia, aBotSpacing,
  bBotDia, bBotSpacing,
  aTopDia, aTopSpacing,
  bTopDia, bTopSpacing,
  edges,
}: {
  la: number; lb: number; t: number
  aBotDia: number; aBotSpacing: number
  bBotDia: number; bBotSpacing: number
  aTopDia: number; aTopSpacing: number
  bTopDia: number; bTopSpacing: number
  edges: EdgeConfig
}) {
  const W = 920, H = 460, pad = 60
  const drawW = W - 2 * pad, drawH = H - 2 * pad
  const scale = Math.min(drawW / la, drawH / lb)
  const w = la * scale, h = lb * scale
  const x0 = (W - w) / 2, y0 = (H - h) / 2
  const topExtA = (la / 4) * scale
  const topExtB = (lb / 4) * scale
  const colW = 16, colH = 16 // corner column symbols

  // Bottom short bars
  const aBotCount = aBotSpacing > 0 ? Math.max(2, Math.floor(lb / aBotSpacing) + 1) : 0
  // Bottom long bars
  const bBotCount = bBotSpacing > 0 ? Math.max(2, Math.floor(la / bBotSpacing) + 1) : 0

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Slab fill */}
      <rect x={x0} y={y0} width={w} height={h} fill="#E8E4DC" stroke="none" />

      {/* Edge beams at continuous edges */}
      {edges.N === 'C' && <rect x={x0} y={y0 - 6} width={w} height={6} fill="#DDD8CE" stroke="#4A4038" strokeWidth={0.5} />}
      {edges.S === 'C' && <rect x={x0} y={y0 + h} width={w} height={6} fill="#DDD8CE" stroke="#4A4038" strokeWidth={0.5} />}
      {edges.W === 'C' && <rect x={x0 - 6} y={y0} width={6} height={h} fill="#DDD8CE" stroke="#4A4038" strokeWidth={0.5} />}
      {edges.E === 'C' && <rect x={x0 + w} y={y0} width={6} height={h} fill="#DDD8CE" stroke="#4A4038" strokeWidth={0.5} />}

      {/* Outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="none" stroke="#4A4038" strokeWidth={2} />

      {/* Corner columns */}
      {[[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]].map(([cx, cy], i) => (
        <rect key={`col-${i}`}
          x={cx! - colW / 2} y={cy! - colH / 2} width={colW} height={colH}
          fill="#4A4038" stroke="none" />
      ))}

      {/* Bottom short bars (horizontal in the A-dir) */}
      {Array.from({ length: aBotCount }).map((_, i) => {
        const py = y0 + (h / Math.max(1, aBotCount - 1)) * i
        return (
          <line key={`abs-${i}`}
            x1={x0 + 8} y1={py} x2={x0 + w - 8} y2={py}
            stroke="#B06008" strokeWidth={0.7} />
        )
      })}
      {/* Bottom long bars (vertical in B-dir) */}
      {Array.from({ length: bBotCount }).map((_, i) => {
        const px = x0 + (w / Math.max(1, bBotCount - 1)) * i
        return (
          <line key={`bbl-${i}`}
            x1={px} y1={y0 + 8} x2={px} y2={y0 + h - 8}
            stroke="#D4820F" strokeWidth={0.6} />
        )
      })}

      {/* Top bars at continuous edges (blue) */}
      {edges.N === 'C' && (() => {
        const cnt = aTopSpacing > 0 ? Math.max(2, Math.floor(la / aTopSpacing)) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const px = x0 + ((w - 16) / Math.max(1, cnt - 1)) * i + 8
          return (
            <line key={`tn-${i}`}
              x1={px} y1={y0 - 4} x2={px} y2={y0 + topExtB}
              stroke="#1755A0" strokeWidth={0.9} />
          )
        })
      })()}
      {edges.S === 'C' && (() => {
        const cnt = aTopSpacing > 0 ? Math.max(2, Math.floor(la / aTopSpacing)) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const px = x0 + ((w - 16) / Math.max(1, cnt - 1)) * i + 8
          return (
            <line key={`ts-${i}`}
              x1={px} y1={y0 + h + 4} x2={px} y2={y0 + h - topExtB}
              stroke="#1755A0" strokeWidth={0.9} />
          )
        })
      })()}
      {edges.W === 'C' && (() => {
        const cnt = bTopSpacing > 0 ? Math.max(2, Math.floor(lb / bTopSpacing)) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const py = y0 + ((h - 16) / Math.max(1, cnt - 1)) * i + 8
          return (
            <line key={`tw-${i}`}
              x1={x0 - 4} y1={py} x2={x0 + topExtA} y2={py}
              stroke="#2A6FDB" strokeWidth={0.9} />
          )
        })
      })()}
      {edges.E === 'C' && (() => {
        const cnt = bTopSpacing > 0 ? Math.max(2, Math.floor(lb / bTopSpacing)) : 0
        return Array.from({ length: cnt }).map((_, i) => {
          const py = y0 + ((h - 16) / Math.max(1, cnt - 1)) * i + 8
          return (
            <line key={`te-${i}`}
              x1={x0 + w + 4} y1={py} x2={x0 + w - topExtA} y2={py}
              stroke="#2A6FDB" strokeWidth={0.9} />
          )
        })
      })()}

      {/* Section cut markers */}
      {/* A-A (horizontal cut at mid-height → short dir section) */}
      <line x1={x0 - 30} y1={y0 + h / 2} x2={x0 - 10} y2={y0 + h / 2}
        stroke="#A02020" strokeWidth={1.5} />
      <line x1={x0 + w + 10} y1={y0 + h / 2} x2={x0 + w + 30} y2={y0 + h / 2}
        stroke="#A02020" strokeWidth={1.5} />
      <text x={x0 - 38} y={y0 + h / 2 + 3} fontFamily="IBM Plex Mono" fontSize={9} fill="#A02020">A</text>
      <text x={x0 + w + 34} y={y0 + h / 2 + 3} fontFamily="IBM Plex Mono" fontSize={9} fill="#A02020">A</text>
      {/* B-B (vertical cut at mid-width → long dir section) */}
      <line x1={x0 + w / 2} y1={y0 - 30} x2={x0 + w / 2} y2={y0 - 10}
        stroke="#1755A0" strokeWidth={1.5} />
      <line x1={x0 + w / 2} y1={y0 + h + 10} x2={x0 + w / 2} y2={y0 + h + 30}
        stroke="#1755A0" strokeWidth={1.5} />
      <text x={x0 + w / 2 - 3} y={y0 - 34} fontFamily="IBM Plex Mono" fontSize={9} fill="#1755A0">B</text>
      <text x={x0 + w / 2 - 3} y={y0 + h + 42} fontFamily="IBM Plex Mono" fontSize={9} fill="#1755A0">B</text>

      {/* Dimension lines */}
      <g stroke="#9A9490" strokeWidth={0.7} fill="#9A9490" fontFamily="IBM Plex Mono" fontSize={9}>
        {/* Horizontal la */}
        <line x1={x0} y1={y0 + h + 24} x2={x0 + w} y2={y0 + h + 24} />
        <line x1={x0} y1={y0 + h + 20} x2={x0} y2={y0 + h + 28} />
        <line x1={x0 + w} y1={y0 + h + 20} x2={x0 + w} y2={y0 + h + 28} />
        <text x={x0 + w / 2} y={y0 + h + 38} textAnchor="middle">la = {fmt0(la)} mm</text>
        {/* Vertical lb */}
        <line x1={x0 - 24} y1={y0} x2={x0 - 24} y2={y0 + h} />
        <line x1={x0 - 28} y1={y0} x2={x0 - 20} y2={y0} />
        <line x1={x0 - 28} y1={y0 + h} x2={x0 - 20} y2={y0 + h} />
        <text x={x0 - 38} y={y0 + h / 2 + 3} textAnchor="end" dominantBaseline="middle"
          transform={`rotate(-90, ${x0 - 38}, ${y0 + h / 2})`}>
          lb = {fmt0(lb)} mm
        </text>
      </g>

      {/* Legend */}
      <g transform={`translate(${x0 + w + 50}, ${y0 + 10})`} fontFamily="IBM Plex Mono" fontSize={8}>
        <line x1={0} y1={0} x2={20} y2={0} stroke="#B06008" strokeWidth={1.2} />
        <text x={24} y={3} fill="var(--color-ink-3)">A-bot (short)</text>
        <line x1={0} y1={14} x2={20} y2={14} stroke="#D4820F" strokeWidth={1.2} />
        <text x={24} y={17} fill="var(--color-ink-3)">B-bot (long)</text>
        <line x1={0} y1={28} x2={20} y2={28} stroke="#1755A0" strokeWidth={1.2} />
        <text x={24} y={31} fill="var(--color-ink-3)">A-top</text>
        <line x1={0} y1={42} x2={20} y2={42} stroke="#2A6FDB" strokeWidth={1.2} />
        <text x={24} y={45} fill="var(--color-ink-3)">B-top</text>
      </g>
    </svg>
  )
}

/** Section view (A-A or B-B) showing slab thickness, rebar dots, top bars at continuous edges */
function SlabSectionView({
  label,
  span, t, cover,
  botDia, botSpacing,
  topDia, topSpacing,
  hasContLeft, hasContRight,
  color,
}: {
  label: string
  span: number; t: number; cover: number
  botDia: number; botSpacing: number
  topDia: number; topSpacing: number
  hasContLeft: boolean; hasContRight: boolean
  color: string
}) {
  const W = 420, H = 120, pad = 30
  const drawW = W - 2 * pad
  const scaleX = drawW / span
  const sw = span * scaleX
  const x0 = (W - sw) / 2
  const y0 = pad
  const sh = 50 // slab thickness visual
  const topBarExt = sw * 0.25 // span/4

  const botCount = botSpacing > 0 ? Math.max(3, Math.floor(span / botSpacing) + 1) : 0

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Slab cross-section */}
      <rect x={x0} y={y0} width={sw} height={sh} fill="#E8E4DC" stroke="#4A4038" strokeWidth={2} />

      {/* Edge beams at continuous supports */}
      {hasContLeft && (
        <rect x={x0 - 10} y={y0 - 10} width={12} height={sh + 20} fill="#DDD8CE" stroke="#4A4038" strokeWidth={1} />
      )}
      {hasContRight && (
        <rect x={x0 + sw - 2} y={y0 - 10} width={12} height={sh + 20} fill="#DDD8CE" stroke="#4A4038" strokeWidth={1} />
      )}

      {/* Bottom bar dots */}
      {Array.from({ length: Math.min(botCount, 20) }).map((_, i) => {
        const px = x0 + 10 + ((sw - 20) / Math.max(1, Math.min(botCount, 20) - 1)) * i
        const py = y0 + sh - cover * (sh / t) - 2
        return <circle key={`b-${i}`} cx={px} cy={py} r={2} fill={color} />
      })}

      {/* Top bars hooking into beams at continuous edges */}
      {hasContLeft && Array.from({ length: 4 }).map((_, i) => {
        const px = x0 + 10 + (topBarExt / 4) * i
        const py = y0 + cover * (sh / t) + 2
        return <circle key={`tl-${i}`} cx={px} cy={py} r={2} fill="#1755A0" />
      })}
      {hasContRight && Array.from({ length: 4 }).map((_, i) => {
        const px = x0 + sw - 10 - (topBarExt / 4) * i
        const py = y0 + cover * (sh / t) + 2
        return <circle key={`tr-${i}`} cx={px} cy={py} r={2} fill="#1755A0" />
      })}

      {/* Dimension: thickness */}
      <g stroke="#9A9490" strokeWidth={0.7} fill="#9A9490" fontFamily="IBM Plex Mono" fontSize={8}>
        <line x1={x0 + sw + 16} y1={y0} x2={x0 + sw + 16} y2={y0 + sh} />
        <line x1={x0 + sw + 12} y1={y0} x2={x0 + sw + 20} y2={y0} />
        <line x1={x0 + sw + 12} y1={y0 + sh} x2={x0 + sw + 20} y2={y0 + sh} />
        <text x={x0 + sw + 24} y={y0 + sh / 2 + 3}>{fmt0(t)} mm</text>
      </g>

      {/* Label */}
      <text x={W / 2} y={H - 6} textAnchor="middle"
        fontFamily="IBM Plex Mono" fontSize={10} fill="var(--color-ink-3)">
        Section {label}
      </text>
    </svg>
  )
}

/** Single calculation row in the breakdown */
function CalcRow({
  symbol, formula, sub, ref, result, unit, status,
}: {
  symbol: string
  formula?: string
  sub?: string
  ref?: string
  result: string
  unit?: string
  status?: 'pass' | 'fail'
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr 110px 50px',
      gap: 4, padding: '3px 0', borderBottom: '0.5px solid var(--color-line-2)',
      alignItems: 'baseline', fontSize: 11,
    }}>
      <span className="mono" style={{ color: 'var(--color-sel)', fontWeight: 500 }}>{symbol}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {formula && <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 10 }}>{formula}</span>}
        {sub && <span className="mono" style={{ color: 'var(--color-ink-3)', fontSize: 9.5, opacity: 0.7 }}>{sub}</span>}
        {ref && <span style={{ color: 'var(--color-ink-4)', fontSize: 9 }}>{ref}</span>}
      </span>
      <span className="mono" style={{
        textAlign: 'right', fontWeight: 600,
        color: status === 'pass' ? 'var(--color-pass)' : status === 'fail' ? 'var(--color-fail)' : 'var(--color-ink)',
      }}>{result}</span>
      <span className="mono" style={{ color: 'var(--color-ink-4)', fontSize: 10 }}>{unit ?? ''}</span>
    </div>
  )
}

/** Group of calc rows with a heading */
function CalcGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        color: 'var(--color-ink-3)', letterSpacing: '0.05em', marginBottom: 4,
        borderBottom: '1px solid var(--color-line-2)', paddingBottom: 2,
      }}>{title}</div>
      {children}
    </div>
  )
}

/** Pass/fail dot indicator */
function StatusDot({ pass }: { pass: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: pass ? 'var(--color-pass)' : 'var(--color-fail)',
      marginRight: 4, verticalAlign: 'middle',
    }} />
  )
}

/** Rebar selection controls for a single group */
function RebarGroup({
  label, direction,
  dia, spacing, asReq, asProv,
  onDia, onSpacing,
  code,
}: {
  label: string; direction: string
  dia: number; spacing: number
  asReq: number; asProv: number
  onDia: (v: number) => void
  onSpacing: (v: number) => void
  code: CodeProvider
}) {
  const pass = asProv >= asReq
  return (
    <div style={{
      border: '0.5px solid var(--color-line-2)', borderRadius: 4,
      padding: '6px 10px', marginBottom: 6,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: 'var(--color-ink-3)' }}>
        {label} <span style={{ fontWeight: 400, fontSize: 9 }}>({direction})</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <select className="select" value={dia}
          onChange={e => onDia(Number(e.target.value))}
          style={{ height: 22, fontSize: 11 }}>
          {BAR_DIAS.map(d => <option key={d} value={d}>{code.bar_label(d)}</option>)}
        </select>
        <span className="mono" style={{ fontSize: 10 }}>@</span>
        <select className="select" value={spacing}
          onChange={e => onSpacing(Number(e.target.value))}
          style={{ height: 22, fontSize: 11 }}>
          {SPACINGS.map(s => <option key={s} value={s}>{s} mm</option>)}
        </select>
      </div>
      <div style={{ fontSize: 10.5, display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <StatusDot pass={pass} />
          <span className="mono" style={{ color: pass ? 'var(--color-pass)' : 'var(--color-fail)' }}>
            {fmt0(asProv)} mm²/m
          </span>
        </span>
        <span style={{ color: 'var(--color-ink-3)' }} className="mono">
          req {fmt0(asReq)} mm²/m
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SlabDesignClient({ initial, code_standard, checks }: SlabDesignClientProps) {
  const code = getCode(code_standard)
  const { spanX, spanY, thickness: t, cover, fc, fy, dlSelf, sdl, ll } = initial
  const alpha1 = code.stress_block_stress_factor(fc)

  // Sort spans: la = short, lb = long
  const la = Math.min(spanX, spanY)
  const lb = Math.max(spanX, spanY)
  const la_m = la / 1000
  const lb_m = lb / 1000

  // ---------- State ----------
  const [panelType, setPanelType] = useState<'one_way' | 'two_way'>(
    initial.slabType === 'one_way' ? 'one_way' : 'two_way'
  )
  const [edgeCase, setEdgeCase] = useState(1)
  const [rebarLayer, setRebarLayer] = useState<'bot' | 'top' | 'both'>('both')

  // Rebar selections
  const [aBotDia, setABotDia] = useState(12)
  const [aBotSpacing, setABotSpacing] = useState(200)
  const [bBotDia, setBBotDia] = useState(12)
  const [bBotSpacing, setBBotSpacing] = useState(200)
  const [aTopDia, setATopDia] = useState(12)
  const [aTopSpacing, setATopSpacing] = useState(200)
  const [bTopDia, setBTopDia] = useState(12)
  const [bTopSpacing, setBTopSpacing] = useState(200)

  // Calc breakdown tab
  const [calcTab, setCalcTab] = useState<'mat' | 'loads' | 'moments' | 'rebar' | 'defl' | 'punch'>('mat')

  // ---------- Derived calculations ----------
  const edges = EDGE_CONFIG[edgeCase]!

  const wsw = 24 * (t / 1000) // self-weight kPa (concrete density ~24 kN/m3)
  const wDL = wsw + sdl
  const wu = 1.2 * wDL + 1.6 * ll

  const m = la / lb // aspect ratio

  const coefs = useMemo(() => lookupCoef(edgeCase, m), [edgeCase, m])

  // Moments via coefficient method
  const Ma_neg = coefs.Ca_neg * wu * la_m * la_m
  const Mb_neg = coefs.Cb_neg * wu * lb_m * lb_m
  const Ma_pos = (coefs.Ca_DL * 1.2 * wDL + coefs.Ca_LL * 1.6 * ll) * la_m * la_m
  const Mb_pos = (coefs.Cb_DL * 1.2 * wDL + coefs.Cb_LL * 1.6 * ll) * lb_m * lb_m

  // Effective depths
  const dA_bot = t - cover - aBotDia / 2
  const dB_bot = t - cover - aBotDia - bBotDia / 2
  const dA_top = t - cover - aTopDia / 2
  const dB_top = t - cover - aTopDia - bTopDia / 2

  // As required
  const As_req_a_pos = AsRequired(Ma_pos, fc, fy, dA_bot, alpha1)
  const As_req_b_pos = AsRequired(Mb_pos, fc, fy, dB_bot, alpha1)
  const As_req_a_neg = AsRequired(Ma_neg, fc, fy, dA_top, alpha1)
  const As_req_b_neg = AsRequired(Mb_neg, fc, fy, dB_top, alpha1)

  // As min (T&S)
  const rhoTemp = code.rho_temp(fy)
  const AsMin = rhoTemp * 1000 * t

  // As provided
  const As_prov_a_bot = AsPer(aBotDia, aBotSpacing)
  const As_prov_b_bot = AsPer(bBotDia, bBotSpacing)
  const As_prov_a_top = AsPer(aTopDia, aTopSpacing)
  const As_prov_b_top = AsPer(bTopDia, bTopSpacing)

  // Governing As required (max of moment-based and As_min)
  const As_gov_a_bot = Math.max(As_req_a_pos, AsMin)
  const As_gov_b_bot = Math.max(As_req_b_pos, AsMin)
  const As_gov_a_top = Math.max(As_req_a_neg, AsMin)
  const As_gov_b_top = Math.max(As_req_b_neg, AsMin)

  // Spacing limits
  const sMax_primary = Math.min(2 * t, 450)
  const sMax_ts = Math.min(5 * t, 450)

  // φMn capacity per metre strip
  const capABot = code.moment_capacity(As_prov_a_bot, 0,
    { b_mm: 1000, h_mm: t, d_mm: dA_bot, clear_cover_mm: cover }, { fc_mpa: fc, fy_mpa: fy, fys_mpa: fy })
  const capBBot = code.moment_capacity(As_prov_b_bot, 0,
    { b_mm: 1000, h_mm: t, d_mm: dB_bot, clear_cover_mm: cover }, { fc_mpa: fc, fy_mpa: fy, fys_mpa: fy })
  const capATop = code.moment_capacity(As_prov_a_top, 0,
    { b_mm: 1000, h_mm: t, d_mm: dA_top, clear_cover_mm: cover }, { fc_mpa: fc, fy_mpa: fy, fys_mpa: fy })
  const capBTop = code.moment_capacity(As_prov_b_top, 0,
    { b_mm: 1000, h_mm: t, d_mm: dB_top, clear_cover_mm: cover }, { fc_mpa: fc, fy_mpa: fy, fys_mpa: fy })

  // Development & splicing
  const ldABot = code.Ld(aBotDia, fc, fy, false, aBotSpacing)
  const ldBBot = code.Ld(bBotDia, fc, fy, false, bBotSpacing)
  const ldATop = code.Ld(aTopDia, fc, fy, true, aTopSpacing)
  const ldBTop = code.Ld(bTopDia, fc, fy, true, bTopSpacing)
  const lsABot = code.lap_splice(ldABot, 'B')
  const lsBBot = code.lap_splice(ldBBot, 'B')
  const lsATop = code.lap_splice(ldATop, 'B')
  const lsBTop = code.lap_splice(ldBTop, 'B')
  // Hook development (simplified: 70% of Ld, min 150mm)
  const ldhABot = Math.max(150, Math.round(ldABot * 0.7))
  const ldhBBot = Math.max(150, Math.round(ldBBot * 0.7))
  const ldhATop = Math.max(150, Math.round(ldATop * 0.7))
  const ldhBTop = Math.max(150, Math.round(ldBTop * 0.7))

  // Material properties for calc breakdown
  const beta1 = code.stress_block_depth_factor(fc)
  const Ec = 4700 * Math.sqrt(fc) // per code — Ec formula consistent across ACI/NSCP

  // Deflection check
  const tMin = code.min_slab_thickness(la, 'both_ends_continuous', fy)
  const deflOk = t >= tMin

  // Ig for a 1m strip
  const Ig = (1000 * t * t * t) / 12
  // Simplified Ie ≈ Ig for uncracked (conservative check only)
  const fr = 0.62 * Math.sqrt(fc) // modulus of rupture
  const Mcr = (fr * Ig) / (t / 2) / 1e6 // kN·m
  const Ie = Ma_pos > 0 ? Math.min(Ig, Ig * Math.pow(Mcr / Ma_pos, 3)) : Ig
  // Immediate deflection (simplified 5wL4/384EI for uniform load)
  const delta_imm = (5 * wu * Math.pow(la_m, 4) * 1e12) / (384 * Ec * Ie) // mm
  const delta_lim = la / 240

  // Punching (flat plate / flat slab only)
  const colSize = 400 // assumed column size for punching
  const d_avg = (dA_bot + dB_bot) / 2
  const punchFactor = code.punching_d_factor()
  const bo = 4 * (colSize + d_avg * 2 * punchFactor)
  const beta_c = 1.0 // square column
  const phiVc_punch = code.Vc_slab_twoway(fc, bo, d_avg, beta_c)
  const Vp = wu * (la_m * lb_m - Math.pow((colSize + d_avg) / 1000, 2)) // kN

  // One-way shear
  const Vu_ow = wu * (la_m / 2 - dA_bot / 1000)
  const phiVn_ow = code.Vc_slab_oneway(fc, 1000, dA_bot)

  // ---------- MTO calculations ----------
  // M1: A-bot, M2: B-bot, M3: A-top, M4: B-top
  const mtoMarks = useMemo(() => {
    const areaPanel = la_m * lb_m

    // Bottom bars run full span with hooks/laps
    const m1CutLen = la // A-bot spans the short direction
    const m1Count = bBotSpacing > 0 ? Math.ceil(lb / bBotSpacing) + 1 : 0
    // Wait — correction: A-bot short bars run in short direction, so cut length = la, count based on lb/spacing
    // Actually: A-bot bars run parallel to la (short span). For a 1m strip, count = lb / spacing.
    // But for the whole slab panel: count = ceil(lb / aBotSpacing) + 1
    const m1TotalLen = (m1Count * m1CutLen) / 1000 // metres
    const m1Mass = m1TotalLen * code.bar_mass_kg_per_m(aBotDia)

    const m2CutLen = lb // B-bot spans the long direction
    const m2Count = aBotSpacing > 0 ? Math.ceil(la / bBotSpacing) + 1 : 0
    const m2TotalLen = (m2Count * m2CutLen) / 1000
    const m2Mass = m2TotalLen * code.bar_mass_kg_per_m(bBotDia)

    // Top bars: only at continuous edges, length = span/4
    const topLenA = la / 4
    const topLenB = lb / 4

    let m3Count = 0
    let m3CutLen = topLenA
    if (edges.N === 'C') m3Count += aTopSpacing > 0 ? Math.ceil(la / aTopSpacing) + 1 : 0
    if (edges.S === 'C') m3Count += aTopSpacing > 0 ? Math.ceil(la / aTopSpacing) + 1 : 0
    // Top bars in the other direction
    if (edges.W === 'C') m3Count += bTopSpacing > 0 ? Math.ceil(lb / bTopSpacing) + 1 : 0
    if (edges.E === 'C') m3Count += bTopSpacing > 0 ? Math.ceil(lb / bTopSpacing) + 1 : 0
    const m3TotalLen = (m3Count * m3CutLen) / 1000
    const m3Mass = m3TotalLen * code.bar_mass_kg_per_m(aTopDia)

    let m4Count = 0
    const m4CutLen = topLenB
    if (edges.W === 'C') m4Count += bTopSpacing > 0 ? Math.ceil(lb / bTopSpacing) + 1 : 0
    if (edges.E === 'C') m4Count += bTopSpacing > 0 ? Math.ceil(lb / bTopSpacing) + 1 : 0
    const m4TotalLen = (m4Count * m4CutLen) / 1000
    const m4Mass = m4TotalLen * code.bar_mass_kg_per_m(bTopDia)

    const totalMass = m1Mass + m2Mass + m3Mass + m4Mass
    const kgPerSqm = areaPanel > 0 ? totalMass / areaPanel : 0

    return {
      m1: { mark: 'M1 (A-bot)', dia: aBotDia, count: m1Count, cutLen: m1CutLen, totalLen: m1TotalLen, mass: m1Mass },
      m2: { mark: 'M2 (B-bot)', dia: bBotDia, count: m2Count, cutLen: m2CutLen, totalLen: m2TotalLen, mass: m2Mass },
      m3: { mark: 'M3 (A-top)', dia: aTopDia, count: m3Count, cutLen: m3CutLen, totalLen: m3TotalLen, mass: m3Mass },
      m4: { mark: 'M4 (B-top)', dia: bTopDia, count: m4Count, cutLen: m4CutLen, totalLen: m4TotalLen, mass: m4Mass },
      totalMass,
      kgPerSqm,
      totalPieces: m1Count + m2Count + m3Count + m4Count,
      totalLen: m1TotalLen + m2TotalLen + m3TotalLen + m4TotalLen,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [la, lb, aBotDia, aBotSpacing, bBotDia, bBotSpacing, aTopDia, aTopSpacing, bTopDia, bTopSpacing, edges, code])

  // =======================================================================
  // RENDER
  // =======================================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── STEP 1b — Edge Conditions & Panel Type ──────────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">1b</span>
          <span className="label">Edge Conditions &amp; Panel Type</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            continuity · coefficient case · m = la/lb
          </span>
        </div>
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: panel type toggle + edge case picker */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <div className="sub-label" style={{ marginBottom: 4 }}>Panel Type</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['one_way', 'two_way'] as const).map(pt => (
                  <button key={pt} type="button"
                    onClick={() => setPanelType(pt)}
                    style={{
                      padding: '4px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                      border: panelType === pt ? '1.5px solid var(--color-sel)' : '1px solid var(--color-line-2)',
                      background: panelType === pt ? 'var(--color-bg)' : 'transparent',
                      fontWeight: panelType === pt ? 600 : 400,
                      color: 'var(--color-ink)',
                    }}>
                    {pt === 'one_way' ? 'One-Way' : 'Two-Way'}
                  </button>
                ))}
              </div>
            </div>

            {panelType === 'two_way' && (
              <div>
                <div className="sub-label" style={{ marginBottom: 6 }}>
                  Edge Case <span className="mono" style={{ fontWeight: 400, fontSize: 9 }}>
                    (solid = continuous, dashed = discontinuous)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <EdgeCaseIcon key={n} caseN={n}
                      active={edgeCase === n}
                      onClick={() => setEdgeCase(n)} />
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--color-ink-3)' }}>
                  N: {edges.N === 'C' ? 'Cont.' : 'Discont.'} &middot;
                  S: {edges.S === 'C' ? 'Cont.' : 'Discont.'} &middot;
                  E: {edges.E === 'C' ? 'Cont.' : 'Discont.'} &middot;
                  W: {edges.W === 'C' ? 'Cont.' : 'Discont.'}
                </div>
              </div>
            )}
          </div>

          {/* Right: key parameters */}
          <div>
            <div className="sub-label" style={{ marginBottom: 4 }}>Panel Parameters</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <KvRow k="la (short)" v={`${fmt0(la)} mm`} />
              <KvRow k="lb (long)" v={`${fmt0(lb)} mm`} />
              <KvRow k="m = la/lb" v={fmt(m, 3)} accent />
              <KvRow k="t" v={`${fmt0(t)} mm`} />
              <KvRow k="wsw" v={`${fmt(wsw, 2)} kPa`} />
              <KvRow k="wDL" v={`${fmt(wDL, 2)} kPa`} />
              <KvRow k="wu" v={`${fmt(wu, 2)} kPa`} accent />
              <KvRow k="Edge case" v={`Case ${edgeCase}`} />
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 2 — Reinforcement Design ──────────────────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">2</span>
          <span className="label">Reinforcement Design</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            bottom mat · top mat · As prov vs req
          </span>
        </div>
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '360px 1fr 1fr', gap: 16 }}>
          {/* Column 1: Plan view */}
          <div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {(['bot', 'top', 'both'] as const).map(ly => (
                <button key={ly} type="button"
                  onClick={() => setRebarLayer(ly)}
                  style={{
                    padding: '2px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                    border: rebarLayer === ly ? '1.5px solid var(--color-sel)' : '1px solid var(--color-line-2)',
                    background: rebarLayer === ly ? 'var(--color-bg)' : 'transparent',
                    color: 'var(--color-ink)',
                  }}>
                  {ly === 'bot' ? 'Bottom' : ly === 'top' ? 'Top' : 'Both'}
                </button>
              ))}
            </div>
            <SlabPlanRebar
              la={la} lb={lb} t={t}
              aBotDia={aBotDia} aBotSpacing={aBotSpacing}
              bBotDia={bBotDia} bBotSpacing={bBotSpacing}
              aTopDia={aTopDia} aTopSpacing={aTopSpacing}
              bTopDia={bTopDia} bTopSpacing={bTopSpacing}
              edges={edges}
              layer={rebarLayer}
            />
          </div>

          {/* Column 2: Rebar groups */}
          <div>
            <RebarGroup label="Bottom Mat Short" direction="la"
              dia={aBotDia} spacing={aBotSpacing}
              asReq={As_gov_a_bot} asProv={As_prov_a_bot}
              onDia={setABotDia} onSpacing={setABotSpacing}
              code={code} />
            <RebarGroup label="Bottom Mat Long" direction="lb"
              dia={bBotDia} spacing={bBotSpacing}
              asReq={As_gov_b_bot} asProv={As_prov_b_bot}
              onDia={setBBotDia} onSpacing={setBBotSpacing}
              code={code} />
            <RebarGroup label="Top Mat Short" direction="la"
              dia={aTopDia} spacing={aTopSpacing}
              asReq={As_gov_a_top} asProv={As_prov_a_top}
              onDia={setATopDia} onSpacing={setATopSpacing}
              code={code} />
            <RebarGroup label="Top Mat Long" direction="lb"
              dia={bTopDia} spacing={bTopSpacing}
              asReq={As_gov_b_top} asProv={As_prov_b_top}
              onDia={setBTopDia} onSpacing={setBTopSpacing}
              code={code} />
          </div>

          {/* Column 3: Capacity summary per metre strip */}
          <div>
            <div className="sub-label" style={{ marginBottom: 6 }}>Capacity Summary (per m strip)</div>

            <div style={{
              border: '0.5px solid var(--color-line-2)', borderRadius: 4,
              padding: '6px 10px', marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: '#B06008' }}>
                Direction A (short span)
              </div>
              <KvRow k="Midspan M+" v={`${fmt(Ma_pos)} kN·m/m`} />
              <KvRow k="As,req+" v={`${fmt0(As_req_a_pos)} mm²/m`} />
              <KvRow k="φMn+" v={`${fmt(capABot.phi_Mn_kNm)} kN·m/m`}
                accent={capABot.phi_Mn_kNm >= Ma_pos} />
              {edges.N === 'C' || edges.S === 'C' ? (
                <>
                  <KvRow k="Support M-" v={`${fmt(Ma_neg)} kN·m/m`} />
                  <KvRow k="As,req-" v={`${fmt0(As_req_a_neg)} mm²/m`} />
                  <KvRow k="φMn-" v={`${fmt(capATop.phi_Mn_kNm)} kN·m/m`}
                    accent={capATop.phi_Mn_kNm >= Ma_neg} />
                </>
              ) : null}
            </div>

            <div style={{
              border: '0.5px solid var(--color-line-2)', borderRadius: 4,
              padding: '6px 10px', marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: '#D4820F' }}>
                Direction B (long span)
              </div>
              <KvRow k="Midspan M+" v={`${fmt(Mb_pos)} kN·m/m`} />
              <KvRow k="As,req+" v={`${fmt0(As_req_b_pos)} mm²/m`} />
              <KvRow k="φMn+" v={`${fmt(capBBot.phi_Mn_kNm)} kN·m/m`}
                accent={capBBot.phi_Mn_kNm >= Mb_pos} />
              {edges.W === 'C' || edges.E === 'C' ? (
                <>
                  <KvRow k="Support M-" v={`${fmt(Mb_neg)} kN·m/m`} />
                  <KvRow k="As,req-" v={`${fmt0(As_req_b_neg)} mm²/m`} />
                  <KvRow k="φMn-" v={`${fmt(capBTop.phi_Mn_kNm)} kN·m/m`}
                    accent={capBTop.phi_Mn_kNm >= Mb_neg} />
                </>
              ) : null}
            </div>

            <div style={{
              border: '0.5px solid var(--color-line-2)', borderRadius: 4,
              padding: '6px 10px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: 'var(--color-ink-3)' }}>
                Limits
              </div>
              <KvRow k="As,min (T&S)" v={`${fmt0(AsMin)} mm²/m`} />
              <KvRow k="ρ,temp" v={fmt(rhoTemp, 4)} />
              <KvRow k="smax (primary)" v={`${fmt0(sMax_primary)} mm`} />
              <KvRow k="smax (T&S)" v={`${fmt0(sMax_ts)} mm`} />
              <KvRow k="Governing ratio"
                v={fmt(Math.max(
                  As_gov_a_bot / Math.max(As_prov_a_bot, 1),
                  As_gov_b_bot / Math.max(As_prov_b_bot, 1),
                ), 2)}
                accent />
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 3 — Design Forces (Coefficient Method) ────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">3</span>
          <span className="label">Design Forces (Coefficient Method)</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            ACI Method 2 · moment coefficients · heatmap
          </span>
        </div>
        <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          {/* Left: coefficient table */}
          <div>
            <div className="sub-label" style={{ marginBottom: 6 }}>
              Coefficient Lookup — Case {edgeCase}, m = {fmt(m, 3)}
            </div>
            <CoefTable
              coefs={coefs}
              Ma_neg={Ma_neg} Mb_neg={Mb_neg}
              Ma_pos={Ma_pos} Mb_pos={Mb_pos}
              wu={wu} la_m={la_m} lb_m={lb_m}
            />
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--color-ink-3)' }}>
              <div className="mono" style={{ marginBottom: 2 }}>
                Ma,neg = Ca,neg &times; wu &times; la&sup2; = {fmt(coefs.Ca_neg, 4)} &times; {fmt(wu, 2)} &times; {fmt(la_m, 3)}&sup2; = {fmt(Ma_neg)} kN&middot;m/m
              </div>
              <div className="mono" style={{ marginBottom: 2 }}>
                Mb,neg = Cb,neg &times; wu &times; lb&sup2; = {fmt(coefs.Cb_neg, 4)} &times; {fmt(wu, 2)} &times; {fmt(lb_m, 3)}&sup2; = {fmt(Mb_neg)} kN&middot;m/m
              </div>
              <div className="mono" style={{ marginBottom: 2 }}>
                Ma,pos = (Ca,DL &times; 1.2wDL + Ca,LL &times; 1.6LL) &times; la&sup2; = {fmt(Ma_pos)} kN&middot;m/m
              </div>
              <div className="mono">
                Mb,pos = (Cb,DL &times; 1.2wDL + Cb,LL &times; 1.6LL) &times; lb&sup2; = {fmt(Mb_pos)} kN&middot;m/m
              </div>
            </div>
          </div>
          {/* Right: moment field heatmap */}
          <div>
            <div className="sub-label" style={{ marginBottom: 6 }}>Moment Field</div>
            <SlabMomentField
              edges={edges}
              Ma_neg={Ma_neg} Mb_neg={Mb_neg}
              Ma_pos={Ma_pos} Mb_pos={Mb_pos}
            />
          </div>
        </div>
      </div>

      {/* ── STEP 4 — Plan & Section ────────────────────────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">4</span>
          <span className="label">Plan &amp; Section</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            full bay plan · A-A &amp; B-B sections
          </span>
        </div>
        <div className="card-b">
          <div style={{ display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
            <SlabFullPlan
              la={la} lb={lb} t={t}
              aBotDia={aBotDia} aBotSpacing={aBotSpacing}
              bBotDia={bBotDia} bBotSpacing={bBotSpacing}
              aTopDia={aTopDia} aTopSpacing={aTopSpacing}
              bTopDia={bTopDia} bTopSpacing={bTopSpacing}
              edges={edges}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <SlabSectionView
              label="A-A"
              span={la} t={t} cover={cover}
              botDia={aBotDia} botSpacing={aBotSpacing}
              topDia={aTopDia} topSpacing={aTopSpacing}
              hasContLeft={edges.W === 'C'}
              hasContRight={edges.E === 'C'}
              color="#B06008"
            />
            <SlabSectionView
              label="B-B"
              span={lb} t={t} cover={cover}
              botDia={bBotDia} botSpacing={bBotSpacing}
              topDia={bTopDia} topSpacing={bTopSpacing}
              hasContLeft={edges.N === 'C'}
              hasContRight={edges.S === 'C'}
              color="#D4820F"
            />
          </div>
        </div>
      </div>

      {/* ── STEP 4b — Development & Splicing ───────────────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">4b</span>
          <span className="label">Development &amp; Splicing</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            Ld · ldh · lap splice (Class B)
          </span>
        </div>
        <div className="card-b">
          <table className="t" style={{ fontSize: 11, width: '100%' }}>
            <thead>
              <tr>
                <th>Mark</th>
                <th style={{ textAlign: 'right' }}>db (mm)</th>
                <th style={{ textAlign: 'right' }}>ld (mm)</th>
                <th style={{ textAlign: 'right' }}>ldh (mm)</th>
                <th style={{ textAlign: 'right' }}>ls Class B (mm)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>A-bot</td>
                <td className="mono" style={{ textAlign: 'right' }}>{aBotDia}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldABot)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldhABot)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(lsABot)}</td>
              </tr>
              <tr>
                <td>B-bot</td>
                <td className="mono" style={{ textAlign: 'right' }}>{bBotDia}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldBBot)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldhBBot)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(lsBBot)}</td>
              </tr>
              <tr>
                <td>A-top</td>
                <td className="mono" style={{ textAlign: 'right' }}>{aTopDia}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldATop)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldhATop)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(lsATop)}</td>
              </tr>
              <tr>
                <td>B-top</td>
                <td className="mono" style={{ textAlign: 'right' }}>{bTopDia}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldBTop)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(ldhBTop)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmt0(lsBTop)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── STEP 5 — Calculation Breakdown (6 tabs) ────────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">5</span>
          <span className="label">Calculation Breakdown</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            material · loads · moments · rebar · deflection · punching
          </span>
        </div>
        <div className="card-b">
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 10, borderBottom: '1px solid var(--color-line-2)', paddingBottom: 4 }}>
            {([
              ['mat', 'Material'],
              ['loads', 'Loads'],
              ['moments', 'Moments'],
              ['rebar', 'Rebar'],
              ['defl', 'Deflection'],
              ['punch', 'Punching'],
            ] as const).map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => setCalcTab(key)}
                style={{
                  padding: '3px 10px', fontSize: 10, borderRadius: '3px 3px 0 0', cursor: 'pointer',
                  border: 'none',
                  background: calcTab === key ? 'var(--color-bg)' : 'transparent',
                  fontWeight: calcTab === key ? 600 : 400,
                  color: calcTab === key ? 'var(--color-sel)' : 'var(--color-ink-3)',
                  borderBottom: calcTab === key ? '2px solid var(--color-sel)' : '2px solid transparent',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {calcTab === 'mat' && (
            <CalcGroup title="Material Properties">
              <CalcRow symbol="f'c" result={fmt0(fc)} unit="MPa"
                formula="Concrete compressive strength" />
              <CalcRow symbol="fy" result={fmt0(fy)} unit="MPa"
                formula="Steel yield strength" />
              <CalcRow symbol="ecu" result="0.003"
                formula="Ultimate concrete strain" ref={`${code_standard.replace(/_/g, ' ')}`} />
              <CalcRow symbol="beta1" formula={`stress_block_depth_factor(${fc})`}
                result={fmt(beta1, 3)} ref="Whitney stress block" />
              <CalcRow symbol="Ec" formula={`4700 * sqrt(f'c)`}
                sub={`= 4700 * sqrt(${fc})`}
                result={fmt0(Ec)} unit="MPa" />
              <CalcRow symbol="rho,min" formula={`rho_temp(${fy})`}
                result={fmt(rhoTemp, 4)}
                ref="Temperature & shrinkage" />
              <CalcRow symbol="t,min" formula={`min_slab_thickness(${fmt0(la)}, both_cont, ${fy})`}
                result={fmt0(tMin)} unit="mm"
                status={deflOk ? 'pass' : 'fail'} />
            </CalcGroup>
          )}

          {calcTab === 'loads' && (
            <CalcGroup title="Load Computation">
              <CalcRow symbol="SW" formula={`24 * (t/1000)`}
                sub={`= 24 * (${fmt0(t)}/1000)`}
                result={fmt(wsw, 2)} unit="kPa" />
              <CalcRow symbol="SDL" result={fmt(sdl, 2)} unit="kPa"
                formula="Superimposed dead load" />
              <CalcRow symbol="LL" result={fmt(ll, 2)} unit="kPa"
                formula="Live load" />
              <CalcRow symbol="wDL" formula="SW + SDL"
                sub={`= ${fmt(wsw, 2)} + ${fmt(sdl, 2)}`}
                result={fmt(wDL, 2)} unit="kPa" />
              <CalcRow symbol="wu" formula="1.2*wDL + 1.6*LL"
                sub={`= 1.2*${fmt(wDL, 2)} + 1.6*${fmt(ll, 2)}`}
                result={fmt(wu, 2)} unit="kPa" />
            </CalcGroup>
          )}

          {calcTab === 'moments' && (
            <CalcGroup title="Moment Coefficients">
              <CalcRow symbol="m" formula="la / lb"
                sub={`= ${fmt0(la)} / ${fmt0(lb)}`}
                result={fmt(m, 3)} />
              <CalcRow symbol="Case" result={`${edgeCase}`}
                formula="Edge condition case" />
              <CalcRow symbol="Ma,neg" formula={`Ca,neg * wu * la^2`}
                sub={`= ${fmt(coefs.Ca_neg, 4)} * ${fmt(wu, 2)} * ${fmt(la_m, 3)}^2`}
                result={fmt(Ma_neg, 2)} unit="kN·m/m" />
              <CalcRow symbol="Mb,neg" formula={`Cb,neg * wu * lb^2`}
                sub={`= ${fmt(coefs.Cb_neg, 4)} * ${fmt(wu, 2)} * ${fmt(lb_m, 3)}^2`}
                result={fmt(Mb_neg, 2)} unit="kN·m/m" />
              <CalcRow symbol="Ma,pos" formula={`(Ca,DL*1.2wDL + Ca,LL*1.6LL) * la^2`}
                sub={`= (${fmt(coefs.Ca_DL, 4)}*${fmt(1.2 * wDL, 2)} + ${fmt(coefs.Ca_LL, 4)}*${fmt(1.6 * ll, 2)}) * ${fmt(la_m, 3)}^2`}
                result={fmt(Ma_pos, 2)} unit="kN·m/m" />
              <CalcRow symbol="Mb,pos" formula={`(Cb,DL*1.2wDL + Cb,LL*1.6LL) * lb^2`}
                sub={`= (${fmt(coefs.Cb_DL, 4)}*${fmt(1.2 * wDL, 2)} + ${fmt(coefs.Cb_LL, 4)}*${fmt(1.6 * ll, 2)}) * ${fmt(lb_m, 3)}^2`}
                result={fmt(Mb_pos, 2)} unit="kN·m/m" />
            </CalcGroup>
          )}

          {calcTab === 'rebar' && (
            <CalcGroup title="Reinforcement Calculations">
              <CalcRow symbol="dA,bot" formula={`t - cover - db/2`}
                sub={`= ${fmt0(t)} - ${fmt0(cover)} - ${aBotDia}/2`}
                result={fmt(dA_bot, 1)} unit="mm" />
              <CalcRow symbol="dB,bot" formula={`t - cover - dbA - dbB/2`}
                sub={`= ${fmt0(t)} - ${fmt0(cover)} - ${aBotDia} - ${bBotDia}/2`}
                result={fmt(dB_bot, 1)} unit="mm" />
              <CalcRow symbol="As,req A+" formula={`from Rn = Mu*1e6 / (0.9*1000*d^2)`}
                result={fmt0(As_req_a_pos)} unit="mm²/m" />
              <CalcRow symbol="As,prov A" result={fmt0(As_prov_a_bot)} unit="mm²/m"
                status={As_prov_a_bot >= As_gov_a_bot ? 'pass' : 'fail'} />
              <CalcRow symbol="As,req B+" formula={`from Rn = Mu*1e6 / (0.9*1000*d^2)`}
                result={fmt0(As_req_b_pos)} unit="mm²/m" />
              <CalcRow symbol="As,prov B" result={fmt0(As_prov_b_bot)} unit="mm²/m"
                status={As_prov_b_bot >= As_gov_b_bot ? 'pass' : 'fail'} />
              <CalcRow symbol="As,min" formula={`rho_temp * 1000 * t`}
                sub={`= ${fmt(rhoTemp, 4)} * 1000 * ${fmt0(t)}`}
                result={fmt0(AsMin)} unit="mm²/m" />
              <CalcRow symbol="smax,prim" formula="min(2t, 450)"
                sub={`= min(${fmt0(2 * t)}, 450)`}
                result={fmt0(sMax_primary)} unit="mm" />
              <CalcRow symbol="smax,T&S" formula="min(5t, 450)"
                sub={`= min(${fmt0(5 * t)}, 450)`}
                result={fmt0(sMax_ts)} unit="mm" />
            </CalcGroup>
          )}

          {calcTab === 'defl' && (
            <CalcGroup title="Deflection Check">
              <CalcRow symbol="t/ln" formula={`t / la`}
                sub={`= ${fmt0(t)} / ${fmt0(la)}`}
                result={fmt(t / la, 4)} />
              <CalcRow symbol="t,min" formula={`min_slab_thickness(${fmt0(la)})`}
                result={fmt0(tMin)} unit="mm"
                status={deflOk ? 'pass' : 'fail'} />
              <CalcRow symbol="Ig" formula="bh^3/12 (b=1000mm)"
                sub={`= 1000 * ${fmt0(t)}^3 / 12`}
                result={(Ig / 1e6).toFixed(1)} unit="x10^6 mm4" />
              <CalcRow symbol="fr" formula="0.62 * sqrt(f'c)"
                sub={`= 0.62 * sqrt(${fc})`}
                result={fmt(fr, 2)} unit="MPa" />
              <CalcRow symbol="Mcr" formula="fr * Ig / (t/2)"
                result={fmt(Mcr, 2)} unit="kN·m" />
              <CalcRow symbol="Ie" formula="min(Ig, Ig*(Mcr/Ma)^3)"
                result={(Ie / 1e6).toFixed(1)} unit="x10^6 mm4" />
              <CalcRow symbol="delta,imm" formula="5wL^4 / (384EcIe)"
                result={fmt(delta_imm, 2)} unit="mm" />
              <CalcRow symbol="delta,lim" formula="L / 240"
                sub={`= ${fmt0(la)} / 240`}
                result={fmt(delta_lim, 1)} unit="mm"
                status={delta_imm <= delta_lim ? 'pass' : 'fail'} />
            </CalcGroup>
          )}

          {calcTab === 'punch' && (
            <CalcGroup title="Punching Shear Check">
              <CalcRow symbol="d,avg" formula="(dA + dB) / 2"
                sub={`= (${fmt(dA_bot, 1)} + ${fmt(dB_bot, 1)}) / 2`}
                result={fmt(d_avg, 1)} unit="mm" />
              <CalcRow symbol="bo" formula={`4*(c + d*2*${punchFactor})`}
                sub={`= 4*(${colSize} + ${fmt(d_avg, 1)}*${2 * punchFactor})`}
                result={fmt0(bo)} unit="mm"
                ref={`Punching d factor = ${punchFactor}`} />
              <CalcRow symbol="beta,c" result={fmt(beta_c, 1)}
                formula="Column aspect ratio (square)" />
              <CalcRow symbol="phi*Vc" formula={`Vc_slab_twoway(${fc}, ${fmt0(bo)}, ${fmt(d_avg, 0)}, ${beta_c})`}
                result={fmt(phiVc_punch, 1)} unit="kN" />
              <CalcRow symbol="Vp" formula="wu * (la*lb - (c+d)^2)"
                sub={`= ${fmt(wu, 2)} * (${fmt(la_m, 3)}*${fmt(lb_m, 3)} - ${((colSize + d_avg) / 1000).toFixed(3)}^2)`}
                result={fmt(Vp, 1)} unit="kN"
                status={phiVc_punch >= Vp ? 'pass' : 'fail'} />
            </CalcGroup>
          )}
        </div>
      </div>

      {/* ── STEP 6 — Material Take-Off ─────────────────────────────────── */}
      <div className="card">
        <div className="card-h">
          <span className="num-badge">6</span>
          <span className="label">Material Take-Off</span>
          <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
            bar marks · lengths · mass · kg/m²
          </span>
        </div>
        <div className="card-b">
          <table className="t" style={{ fontSize: 11, width: '100%' }}>
            <thead>
              <tr>
                <th>Mark</th>
                <th style={{ textAlign: 'right' }}>Dia (mm)</th>
                <th style={{ textAlign: 'right' }}>Count</th>
                <th style={{ textAlign: 'right' }}>Cut Length (mm)</th>
                <th style={{ textAlign: 'right' }}>Total Length (m)</th>
                <th style={{ textAlign: 'right' }}>Mass (kg)</th>
              </tr>
            </thead>
            <tbody>
              {[mtoMarks.m1, mtoMarks.m2, mtoMarks.m3, mtoMarks.m4].map(r => (
                <tr key={r.mark}>
                  <td className="mono">{r.mark}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.dia}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.count}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt0(r.cutLen)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(r.totalLen, 1)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(r.mass, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary strip */}
          <div style={{
            marginTop: 10, display: 'flex', gap: 20, padding: '8px 12px',
            background: 'var(--color-bg)', borderRadius: 4,
            fontSize: 11, fontFamily: 'var(--mono)',
          }}>
            <span>
              <span style={{ color: 'var(--color-ink-3)' }}>Marks: </span>
              <span style={{ fontWeight: 600 }}>4</span>
            </span>
            <span>
              <span style={{ color: 'var(--color-ink-3)' }}>Pieces: </span>
              <span style={{ fontWeight: 600 }}>{mtoMarks.totalPieces}</span>
            </span>
            <span>
              <span style={{ color: 'var(--color-ink-3)' }}>Total Length: </span>
              <span style={{ fontWeight: 600 }}>{fmt(mtoMarks.totalLen, 1)} m</span>
            </span>
            <span>
              <span style={{ color: 'var(--color-ink-3)' }}>Total Mass: </span>
              <span style={{ fontWeight: 600 }}>{fmt(mtoMarks.totalMass, 1)} kg</span>
            </span>
            <span>
              <span style={{ color: 'var(--color-ink-3)' }}>kg/m²: </span>
              <span style={{ fontWeight: 600, color: 'var(--color-sel)' }}>{fmt(mtoMarks.kgPerSqm, 2)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tiny reusable KV row
// ---------------------------------------------------------------------------

function KvRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 8,
      fontSize: 10.5, padding: '1.5px 0',
    }}>
      <span style={{ color: 'var(--color-ink-3)' }}>{k}</span>
      <span className="mono" style={{
        color: accent ? 'var(--color-pass)' : 'var(--color-ink)',
        fontWeight: accent ? 600 : 400,
      }}>{v}</span>
    </div>
  )
}
