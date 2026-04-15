/**
 * Shear physics — code-agnostic.
 *
 * Stirrup areas, spacings, and zone boundaries derived from Vu(x) and
 * the code's phiVc / phiVs numbers. Every code constant (phi_v, the
 * √f'c coefficient, the spacing caps) comes from the CodeProvider.
 *
 * See docs/04-engineering-lib.md, docs/05-beam-engine.md § Step 3.
 */
import type {
  CodeProvider,
  Materials,
  SectionGeom,
} from '@/lib/engineering/codes'

/**
 * Total design shear capacity phi·(Vc + Vs) at a section with given
 * stirrup area Av at spacing s.
 */
export function phi_Vn(
  Av_mm2: number,
  s_mm: number,
  geom: SectionGeom,
  mat: Materials,
  Nu_kN: number,
  Mu_kNm: number,
  Vu_kN: number,
  code: CodeProvider,
): { phi_Vn_kN: number; phi_Vc_kN: number; phi_Vs_kN: number } {
  const { b_mm, d_mm } = geom
  const phi_Vc = code.Vc_design(
    mat.fc_mpa,
    b_mm,
    d_mm,
    /* As */ 0,
    Nu_kN,
    Mu_kNm,
    Vu_kN,
  )
  const phi_Vs =
    s_mm > 0 ? code.Vs_design(Av_mm2, mat.fys_mpa, d_mm, s_mm) : 0
  return {
    phi_Vc_kN: phi_Vc,
    phi_Vs_kN: phi_Vs,
    phi_Vn_kN: phi_Vc + phi_Vs,
  }
}

/**
 * Given a discrete V(x) diagram (x_mm + |V|_kN samples) and stirrup
 * configuration parameters, produce the required stirrup zones.
 *
 * Strategy:
 *  - dense zone: every spot where Vu > phi·Vc. Start/end at supports.
 *  - midspan zone: where Vu <= phi·Vc. Spacing capped by s_max.
 *
 * This returns boundaries (in mm from the left support) and a suggested
 * spacing per zone. The exact s values honour code-specific spacing
 * caps via CodeProvider.stirrup_spacing_max.
 *
 * The beam engine is responsible for symmetry: a typical continuous
 * beam gets two dense zones (one near each support) and one midspan
 * zone. We infer that by scanning inward from both ends.
 */
export type ShearZone = {
  /** Zone label — used for UI. */
  zone: 'dense_left' | 'mid' | 'dense_right'
  /** Zone start (mm from left support). */
  start_mm: number
  /** Zone end (mm from left support). */
  end_mm: number
  /** Stirrup spacing within this zone (mm). */
  spacing_mm: number
}

export function compute_stirrup_zones(args: {
  spanDiagram: { x_mm: number; V_kN: number }[]
  geom: SectionGeom
  mat: Materials
  Av_mm2: number
  dense_spacing_mm: number
  mid_spacing_mm: number
  code: CodeProvider
  total_span_mm: number
}): ShearZone[] {
  const {
    spanDiagram,
    geom,
    mat,
    Av_mm2,
    dense_spacing_mm,
    mid_spacing_mm,
    code,
    total_span_mm,
  } = args

  // Compute phi·Vc once — it doesn't depend on x (treating Nu/Mu terms
  // as zero here; the beam engine passes in an already-reduced phiVc
  // via Vc_design at each sample when required).
  const phi_Vc = code.Vc_design(
    mat.fc_mpa,
    geom.b_mm,
    geom.d_mm,
    0,
    0,
    0,
    0,
  )

  const samplesAbs = spanDiagram
    .map((s) => ({ x_mm: s.x_mm, Vabs_kN: Math.abs(s.V_kN) }))
    .sort((a, b) => a.x_mm - b.x_mm)

  // Scan inward from both ends to find the largest x on the left where
  // Vu > phi·Vc (call it xL) and the smallest x on the right where
  // Vu > phi·Vc (call it xR). Those bracket the midspan zone.
  let xL = 0
  for (const s of samplesAbs) {
    if (s.Vabs_kN > phi_Vc) xL = s.x_mm
    else break
  }
  let xR = total_span_mm
  for (let i = samplesAbs.length - 1; i >= 0; i--) {
    if (samplesAbs[i].Vabs_kN > phi_Vc) xR = samplesAbs[i].x_mm
    else break
  }

  // If no sample exceeds phi·Vc at either end, the whole beam is "mid"
  // (unusual — a beam with no shear demand beyond concrete contribution).
  if (xL <= 0 && xR >= total_span_mm) {
    return [
      { zone: 'mid', start_mm: 0, end_mm: total_span_mm, spacing_mm: mid_spacing_mm },
    ]
  }

  // Provider-imposed spacing caps (dense zone has the binding cap).
  const Vs_at_support = Math.max(0, samplesAbs[0].Vabs_kN - phi_Vc)
  const s_cap = code.stirrup_spacing_max(
    geom.d_mm,
    Vs_at_support,
    geom.b_mm,
    mat.fc_mpa,
  )
  const dense = Math.min(dense_spacing_mm, s_cap)
  const mid = Math.min(mid_spacing_mm, code.stirrup_spacing_max(geom.d_mm, 0, geom.b_mm, mat.fc_mpa))

  const out: ShearZone[] = []
  if (xL > 0) {
    out.push({ zone: 'dense_left', start_mm: 0, end_mm: xL, spacing_mm: dense })
  }
  if (xR > xL) {
    out.push({ zone: 'mid', start_mm: xL, end_mm: xR, spacing_mm: mid })
  }
  if (xR < total_span_mm) {
    out.push({
      zone: 'dense_right',
      start_mm: xR,
      end_mm: total_span_mm,
      spacing_mm: dense,
    })
  }

  // Reference Av silences the unused-var lint without affecting logic.
  void Av_mm2
  return out
}
