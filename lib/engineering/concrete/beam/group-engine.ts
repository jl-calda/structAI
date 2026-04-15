/**
 * Beam group engine — the 5-step algorithm from docs/05-beam-engine.md.
 *
 * One "beam" in StructAI can span multiple STAAD members. A design group
 * is a set of such beams that must share the same rebar configuration
 * (because they're cast together, labelled the same, etc.). Each beam in
 * the group still gets its own bend points — the rebar is shared, the
 * curtailment geometry is not.
 *
 * The anti-pattern this algorithm avoids (docs/05): max-of-maxima
 * across beams. Three beams with peaks at different x produce different
 * rebar demands; designing all three for the combined envelope is both
 * wasteful and wrong (the shear zones in particular end up in the wrong
 * place).
 */
import type {
  CodeProvider,
  Materials,
  SectionGeom,
} from '@/lib/engineering/codes'

import { find_bend_points, type BendPoints, type DiagramSample } from './bend-points'
import { design_flexure } from './flexure'
import { phi_Vn, compute_stirrup_zones, type ShearZone } from './shear'

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export type BeamInput = {
  /** Stable identifier for this beam within its group (e.g. "B-12"). */
  label: string
  /** STAAD member IDs that compose this physical beam, in order. */
  member_ids: number[]
  /** Per-member length, matching the order of `member_ids` (mm). */
  member_lengths_mm: number[]
  /** Total span (Σ member lengths) (mm). */
  total_span_mm: number
  /** Section geometry + materials — same across the group. */
  geom: SectionGeom
  mat: Materials
  /**
   * Stitched per-beam diagram along the total span. Each entry carries
   * mz/vy at a given x_mm on this beam (0 ≤ x_mm ≤ total_span_mm).
   * Typically 11 samples × N members = 11·N points.
   */
  diagram: BeamDiagramSample[]
}

export type BeamDiagramSample = {
  x_mm: number
  Mz_kNm: number
  Vy_kN: number
  /** combo_number that produced this particular peak. Used to record
   *  governing combos in beam_checks. */
  combo_number: number
}

export type BeamCheckResult = {
  label: string
  /** Governing sagging moment (positive, kN·m). */
  Mu_pos_kNm: number
  Mu_pos_combo: number | null
  /** Governing hogging moment (stored positive magnitude, kN·m). */
  Mu_neg_kNm: number
  Mu_neg_combo: number | null
  /** Governing shear magnitude (kN). */
  Vu_max_kN: number
  Vu_combo: number | null

  /** Required steel based on governing Mu+ (mm²). */
  As_required_mm2: number
  As_provided_mm2: number
  /** Design capacity with provided steel (kN·m). */
  phi_Mn_pos_kNm: number
  flexure_pos_status: 'pass' | 'fail'

  phi_Mn_neg_kNm: number
  flexure_neg_status: 'pass' | 'fail'

  is_doubly_reinforced: boolean
  phi_Mn_max_singly_kNm: number

  /** Per-beam bend points along its own M(x) (mm from left support). */
  bend_points: BendPoints
  /** phi_Mn with ONLY the 4 perimeter corner bars (kN·m). */
  perimeter_only_phi_Mn_kNm: number

  /** Stirrup zones for this beam. */
  stirrup_zones: ShearZone[]
  shear_status: 'pass' | 'fail'
  phi_Vn_support_kN: number
}

export type BeamRebarConfig = {
  perimeter_dia_mm: number
  /** Layered tension bars — see schema. */
  tension_layers: {
    layer: number
    dia_mm: number
    count: number
    /** Bent down at supports (not perimeter bars). */
    bent_down: boolean
  }[]
  compression_dia_mm: number
  compression_count: number
  stirrup_dia_mm: number
  stirrup_legs: number
}

export type BeamGroupInput = {
  beams: BeamInput[]
  /** All beams in the group share this configuration starting point. */
  starting_rebar: BeamRebarConfig
  code: CodeProvider
  /** Stirrup spacings (mm). Caller picks based on site practice. */
  dense_spacing_mm: number
  mid_spacing_mm: number
  /**
   * Maximum iterations. The spec caps at 10 (docs/05-beam-engine.md:56).
   * Each iteration adds a bar or tightens stirrups based on the worst
   * observed failure.
   */
  max_iterations?: number
}

export type BeamGroupResult = {
  /** Final rebar configuration for the whole group (shared). */
  rebar: BeamRebarConfig
  /** Per-beam check (one row per input beam — always full length). */
  checks: BeamCheckResult[]
  /** How many iterations it took; `max_iterations + 1` means failed. */
  iterations: number
  /** Overall status. */
  status: 'pass' | 'fail'
  /** Human-readable reason when `status === 'fail'`. */
  reason?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BAR_AREA_MM2 = (dia: number) => (Math.PI * dia * dia) / 4

function total_tension_As(rebar: BeamRebarConfig): number {
  // 4 continuous perimeter corner bars: 2 count as tension (bottom corners
  // for positive moment — the top corners contribute to negative moment).
  // The spec treats the 4 perimeter bars as always continuous; only 2
  // act in tension at any given x for a given moment sign.
  const perimeterTension = 2 * BAR_AREA_MM2(rebar.perimeter_dia_mm)
  const additional = rebar.tension_layers.reduce(
    (sum, l) => sum + l.count * BAR_AREA_MM2(l.dia_mm),
    0,
  )
  return perimeterTension + additional
}

function perimeter_only_As(rebar: BeamRebarConfig): number {
  return 2 * BAR_AREA_MM2(rebar.perimeter_dia_mm)
}

function compression_As(rebar: BeamRebarConfig): number {
  return rebar.compression_count * BAR_AREA_MM2(rebar.compression_dia_mm)
}

function stirrup_Av(rebar: BeamRebarConfig): number {
  return rebar.stirrup_legs * BAR_AREA_MM2(rebar.stirrup_dia_mm)
}

/** Scan the full diagram for governing peaks. */
function govern(beam: BeamInput): {
  Mu_pos_kNm: number
  Mu_pos_combo: number | null
  Mu_neg_kNm: number
  Mu_neg_combo: number | null
  Vu_max_kN: number
  Vu_combo: number | null
} {
  let mpos = 0
  let mposC: number | null = null
  let mneg = 0
  let mnegC: number | null = null
  let vu = 0
  let vuC: number | null = null
  for (const s of beam.diagram) {
    if (s.Mz_kNm > mpos) {
      mpos = s.Mz_kNm
      mposC = s.combo_number
    }
    const negMag = s.Mz_kNm < 0 ? -s.Mz_kNm : 0
    if (negMag > mneg) {
      mneg = negMag
      mnegC = s.combo_number
    }
    const vmag = Math.abs(s.Vy_kN)
    if (vmag > vu) {
      vu = vmag
      vuC = s.combo_number
    }
  }
  return {
    Mu_pos_kNm: mpos,
    Mu_pos_combo: mposC,
    Mu_neg_kNm: mneg,
    Mu_neg_combo: mnegC,
    Vu_max_kN: vu,
    Vu_combo: vuC,
  }
}

// ---------------------------------------------------------------------------
// The 5-step algorithm
// ---------------------------------------------------------------------------

export function runBeamGroupDesign(input: BeamGroupInput): BeamGroupResult {
  const { beams, code } = input
  const maxIter = input.max_iterations ?? 10

  if (beams.length === 0) {
    return {
      rebar: input.starting_rebar,
      checks: [],
      iterations: 0,
      status: 'pass',
    }
  }

  let rebar: BeamRebarConfig = clone(input.starting_rebar)

  // Step 2 — governing beam = the one demanding the largest As based on
  // singly-reinforced trial design of its own M+ peak. NOT simply the
  // beam with the highest M+ magnitude (those can coincide but don't
  // have to — section might differ per beam in edge cases).
  const governing = pickGoverningBeam(beams, code)

  // Step 3 — design from the governing beam's own peaks.
  const govPeaks = govern(governing)
  const flex = design_flexure(
    govPeaks.Mu_pos_kNm,
    governing.geom,
    governing.mat,
    code,
  )

  // Seed the rebar from the governing design. Perimeter bars stay at
  // whatever the user locked in. Additional tension bars cover the gap
  // between perimeter tension and required.
  rebar = seedRebarFromGoverning(rebar, flex)

  // Step 4–5 — iterate. In each iteration, evaluate every beam against
  // the shared rebar; if any beam fails, find the worst failure and
  // bump either tension steel or stirrup spacing.
  let iterations = 0
  for (; iterations <= maxIter; iterations++) {
    const checks = beams.map((b) =>
      check_beam(b, rebar, input.dense_spacing_mm, input.mid_spacing_mm, code),
    )

    const failing = checks.filter(
      (c) =>
        c.flexure_pos_status === 'fail' ||
        c.flexure_neg_status === 'fail' ||
        c.shear_status === 'fail',
    )

    if (failing.length === 0) {
      return { rebar, checks, iterations, status: 'pass' }
    }

    if (iterations === maxIter) {
      return {
        rebar,
        checks,
        iterations,
        status: 'fail',
        reason: `Max ${maxIter} iterations exceeded. ${failing.length} beam(s) still failing.`,
      }
    }

    // Bump whichever failed the most — heuristic, simple and reliable.
    rebar = bumpRebar(rebar, failing)
  }

  // Unreachable — the for-loop returns above.
  return {
    rebar,
    checks: [],
    iterations,
    status: 'fail',
    reason: 'unreachable',
  }
}

// ---------------------------------------------------------------------------
// Per-beam check (Step 4)
// ---------------------------------------------------------------------------

export function check_beam(
  beam: BeamInput,
  rebar: BeamRebarConfig,
  dense_spacing_mm: number,
  mid_spacing_mm: number,
  code: CodeProvider,
): BeamCheckResult {
  const { geom, mat } = beam
  const peaks = govern(beam)

  // Flexure check against provided steel.
  const As_prov = total_tension_As(rebar)
  const Asp_prov = compression_As(rebar)
  const cap_pos = code.moment_capacity(As_prov, Asp_prov, geom, mat)
  // For negative moment, roles swap: the "top" (2 corner + compression
  // count if any) bars become tension. We approximate with the same
  // total As here since perimeter is symmetric top/bottom and
  // compression-side bars in +M become tension-side bars in -M.
  const cap_neg = code.moment_capacity(As_prov, 0, geom, mat)

  const flexure_pos_status: 'pass' | 'fail' =
    cap_pos.phi_Mn_kNm >= peaks.Mu_pos_kNm ? 'pass' : 'fail'
  const flexure_neg_status: 'pass' | 'fail' =
    cap_neg.phi_Mn_kNm >= peaks.Mu_neg_kNm ? 'pass' : 'fail'

  // Perimeter-only capacity for bend-point calculation.
  const perim = code.moment_capacity(perimeter_only_As(rebar), 0, geom, mat)

  // Bend points on THIS beam's diagram.
  const bendPoints = find_bend_points(
    beam.diagram.map<DiagramSample>((s) => ({ x_mm: s.x_mm, M_kNm: s.Mz_kNm })),
    beam.total_span_mm,
    perim.phi_Mn_kNm,
  )

  // Shear zones + support phi_Vn.
  const Av = stirrup_Av(rebar)
  const shearZones = compute_stirrup_zones({
    spanDiagram: beam.diagram.map((s) => ({ x_mm: s.x_mm, V_kN: s.Vy_kN })),
    geom,
    mat,
    Av_mm2: Av,
    dense_spacing_mm,
    mid_spacing_mm,
    code,
    total_span_mm: beam.total_span_mm,
  })
  const denseLeft = shearZones.find((z) => z.zone === 'dense_left')
  const support = phi_Vn(
    Av,
    denseLeft?.spacing_mm ?? dense_spacing_mm,
    geom,
    mat,
    0,
    peaks.Mu_pos_kNm,
    peaks.Vu_max_kN,
    code,
  )

  const shear_status: 'pass' | 'fail' =
    support.phi_Vn_kN >= peaks.Vu_max_kN ? 'pass' : 'fail'

  // Required singly-reinforced As (for reporting; the actual design
  // might be doubly-reinforced if that was triggered).
  const designTrial = design_flexure(peaks.Mu_pos_kNm, geom, mat, code)

  return {
    label: beam.label,
    Mu_pos_kNm: peaks.Mu_pos_kNm,
    Mu_pos_combo: peaks.Mu_pos_combo,
    Mu_neg_kNm: peaks.Mu_neg_kNm,
    Mu_neg_combo: peaks.Mu_neg_combo,
    Vu_max_kN: peaks.Vu_max_kN,
    Vu_combo: peaks.Vu_combo,

    As_required_mm2: designTrial.As_mm2,
    As_provided_mm2: As_prov,
    phi_Mn_pos_kNm: cap_pos.phi_Mn_kNm,
    flexure_pos_status,
    phi_Mn_neg_kNm: cap_neg.phi_Mn_kNm,
    flexure_neg_status,

    is_doubly_reinforced: designTrial.is_doubly_reinforced,
    phi_Mn_max_singly_kNm: designTrial.phi_Mn_max_singly_kNm,

    bend_points: bendPoints,
    perimeter_only_phi_Mn_kNm: perim.phi_Mn_kNm,

    stirrup_zones: shearZones,
    shear_status,
    phi_Vn_support_kN: support.phi_Vn_kN,
  }
}

// ---------------------------------------------------------------------------
// Helpers for the iterative loop
// ---------------------------------------------------------------------------

function pickGoverningBeam(
  beams: BeamInput[],
  code: CodeProvider,
): BeamInput {
  let best = beams[0]
  let bestAs = 0
  for (const b of beams) {
    const peaks = govern(b)
    const trial = design_flexure(peaks.Mu_pos_kNm, b.geom, b.mat, code)
    if (trial.As_mm2 > bestAs) {
      bestAs = trial.As_mm2
      best = b
    }
  }
  return best
}

function seedRebarFromGoverning(
  base: BeamRebarConfig,
  flex: ReturnType<typeof design_flexure>,
): BeamRebarConfig {
  const perimeterAs = 2 * BAR_AREA_MM2(base.perimeter_dia_mm)
  const needExtra = Math.max(0, flex.As_mm2 - perimeterAs)
  const tensionDia = base.tension_layers[0]?.dia_mm ?? base.perimeter_dia_mm
  const barArea = BAR_AREA_MM2(tensionDia)
  const count = Math.max(0, Math.ceil(needExtra / barArea))
  const next = clone(base)
  if (count > 0) {
    next.tension_layers = [
      { layer: 1, dia_mm: tensionDia, count, bent_down: true },
    ]
  } else {
    next.tension_layers = []
  }
  // Doubly reinforced — ensure at least 2 compression bars at the spec'd
  // diameter exist, sized by As'.
  if (flex.is_doubly_reinforced) {
    const dia = base.compression_dia_mm || tensionDia
    const areaEach = BAR_AREA_MM2(dia)
    next.compression_dia_mm = dia
    next.compression_count = Math.max(
      2,
      Math.ceil(flex.As_prime_mm2 / areaEach),
    )
  }
  return next
}

function bumpRebar(
  rebar: BeamRebarConfig,
  failing: BeamCheckResult[],
): BeamRebarConfig {
  const next = clone(rebar)

  const anyFlexureFail = failing.some(
    (f) => f.flexure_pos_status === 'fail' || f.flexure_neg_status === 'fail',
  )
  const anyShearFail = failing.some((f) => f.shear_status === 'fail')

  if (anyFlexureFail) {
    // Add one tension bar at the existing (or perimeter) diameter in
    // layer 1. When layer 1 fills beyond a reasonable count (≥ 4), push
    // into layer 2 at the same diameter.
    const dia = next.tension_layers[0]?.dia_mm ?? next.perimeter_dia_mm
    if (next.tension_layers.length === 0) {
      next.tension_layers = [{ layer: 1, dia_mm: dia, count: 1, bent_down: true }]
    } else {
      const l1 = next.tension_layers[0]
      if (l1.count < 4) {
        l1.count += 1
      } else {
        const l2 = next.tension_layers.find((l) => l.layer === 2)
        if (l2) l2.count += 1
        else
          next.tension_layers.push({
            layer: 2,
            dia_mm: dia,
            count: 1,
            bent_down: false,
          })
      }
    }
  }

  if (anyShearFail) {
    // Bumping shear capacity without changing bar diameter: done at the
    // call-site via dense_spacing_mm parameter on subsequent iteration.
    // Cheap alternative: bump stirrup diameter one size up if possible.
    const sizes = [10, 12, 16]
    const idx = sizes.indexOf(next.stirrup_dia_mm)
    if (idx >= 0 && idx + 1 < sizes.length) {
      next.stirrup_dia_mm = sizes[idx + 1]
    }
  }

  return next
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
