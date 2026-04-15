/**
 * Flexure physics — code-agnostic.
 *
 * Every code-specific number (f'c, fy, phi, gamma, beta1, eta, eps_cu)
 * arrives via the `CodeProvider` argument. This file only contains the
 * geometry + equilibrium of a rectangular section with optional
 * compression reinforcement; it does not know about ACI vs EC2.
 *
 * The doubly-reinforced trigger is expressed in terms of the single-
 * reinforced capacity `phi_Mn_max_singly`. If Mu exceeds that, we hand
 * back a size-up result: required compression steel As' and verified
 * combined capacity via `CodeProvider.moment_capacity`.
 *
 * Reference: docs/05-beam-engine.md, docs/06-elements.md.
 */
import type {
  CodeProvider,
  Materials,
  MomentCapacityResult,
  SectionGeom,
} from '@/lib/engineering/codes'

/**
 * Textbook singly-reinforced As from Mu assuming the tension steel yields
 * and stress-block equilibrium (C = T → a·b·0.85f'c = As·fy, and
 * phi·As·fy·(d - a/2) = Mu).
 *
 * Solves the quadratic on `a`:
 *   Mu = phi · 0.85 f'c · b · a · (d - a/2)
 *   → a = d - sqrt(d^2 - 2 Mu / (phi · 0.85 f'c · b))
 *
 * Unit note: Mu_kNm × 1e6 → N·mm; b/d in mm; f'c in MPa (N/mm²).
 * Returns As in mm². The `phi_flexure` factor is provided by the code —
 * codes where reduction is applied on materials (EC2/CSA) pass phi=1.
 */
export function As_required_singly(
  Mu_kNm: number,
  geom: SectionGeom,
  mat: Materials,
  code: CodeProvider,
  phi_flexure = 0.9,
): number {
  if (Mu_kNm <= 0) return 0
  const { b_mm, d_mm } = geom
  const fc = code.fcd(mat.fc_mpa)
  const fy = code.fyd(mat.fy_mpa)
  const k = code.stress_block_stress_factor(fc) // 0.85 for ACI
  const Mu_Nmm = Mu_kNm * 1e6

  const radicand = d_mm * d_mm - (2 * Mu_Nmm) / (phi_flexure * k * fc * b_mm)
  if (radicand < 0) {
    // Mu exceeds the physical capacity of the section even with a = d.
    // Caller (flexural design) should trigger doubly-reinforced.
    return Number.POSITIVE_INFINITY
  }
  const a_mm = d_mm - Math.sqrt(radicand)
  return (k * fc * b_mm * a_mm) / fy
}

/**
 * Maximum singly-reinforced design capacity `phi_Mn_max_singly` (kN·m).
 *
 * "Max singly" means at the tension-controlled strain limit (ε_t = 0.005
 * for ACI). For a steel layer at depth d, the neutral axis at that limit
 * satisfies c/d = 0.003 / (0.003 + 0.005) = 0.375. In EC2 where
 * ε_cu = 0.0035 the ratio differs — we query the code for both.
 *
 * We compute:
 *   c_max = d · (eps_cu / (eps_cu + eps_t_limit))
 *   a_max = beta1 · c_max
 *   As_max = (k · f'c · b · a_max) / fy
 *   phi_Mn_max = phi · As_max · fy · (d - a_max / 2)
 *
 * This is the threshold the flexure engine compares Mu against to decide
 * whether doubly reinforced is required.
 */
export function phi_Mn_max_singly(
  geom: SectionGeom,
  mat: Materials,
  code: CodeProvider,
  phi_flexure = 0.9,
  eps_cu = 0.003,
  eps_t_limit = 0.005,
): { phi_Mn_kNm: number; As_max_mm2: number; a_max_mm: number } {
  const { b_mm, d_mm } = geom
  const fc = code.fcd(mat.fc_mpa)
  const fy = code.fyd(mat.fy_mpa)
  const beta1 = code.stress_block_depth_factor(fc)
  const k = code.stress_block_stress_factor(fc)

  const c_max = d_mm * (eps_cu / (eps_cu + eps_t_limit))
  const a_max = beta1 * c_max
  const As_max = (k * fc * b_mm * a_max) / fy
  const Mn_Nmm = As_max * fy * (d_mm - a_max / 2)
  return {
    phi_Mn_kNm: (phi_flexure * Mn_Nmm) / 1e6,
    As_max_mm2: As_max,
    a_max_mm: a_max,
  }
}

/**
 * Given the provided tension + compression steel areas, compute the
 * section's design moment capacity via the code's moment_capacity method.
 * Thin convenience wrapper so callers don't have to thread the code
 * object twice (once for trigger check, once for actual phi_Mn).
 */
export function phi_Mn_of(
  As_mm2: number,
  As_prime_mm2: number,
  geom: SectionGeom,
  mat: Materials,
  code: CodeProvider,
): MomentCapacityResult {
  return code.moment_capacity(As_mm2, As_prime_mm2, geom, mat)
}

/**
 * Decide whether to go doubly-reinforced and return the resulting
 * configuration. This is the structural decision point; the exact
 * phi_Mn computation is delegated to the code.
 *
 * Algorithm:
 *   1. Compute singly-reinforced As_required for Mu.
 *   2. If As_required <= As_max (from phi_Mn_max_singly) → singly, done.
 *   3. Else: Mu2 = Mu - phi_Mn_max_singly. Compression steel contributes
 *      the extra: As' = Mu2 / (phi · fy · (d - d')) under strain
 *      compatibility. Caller verifies by calling `code.moment_capacity`.
 *
 * Returns the computed areas; final phi_Mn is always checked against
 * the actual provided steel by the caller — do not short-circuit.
 */
export function design_flexure(
  Mu_kNm: number,
  geom: SectionGeom,
  mat: Materials,
  code: CodeProvider,
  phi_flexure = 0.9,
): {
  As_mm2: number
  As_prime_mm2: number
  is_doubly_reinforced: boolean
  phi_Mn_max_singly_kNm: number
} {
  if (Mu_kNm <= 0) {
    return {
      As_mm2: 0,
      As_prime_mm2: 0,
      is_doubly_reinforced: false,
      phi_Mn_max_singly_kNm: 0,
    }
  }

  const cap = phi_Mn_max_singly(geom, mat, code, phi_flexure)

  const As_singly = As_required_singly(Mu_kNm, geom, mat, code, phi_flexure)

  if (Number.isFinite(As_singly) && As_singly <= cap.As_max_mm2) {
    return {
      As_mm2: As_singly,
      As_prime_mm2: 0,
      is_doubly_reinforced: false,
      phi_Mn_max_singly_kNm: cap.phi_Mn_kNm,
    }
  }

  // Doubly reinforced. Additional moment beyond the singly-reinforced
  // capacity is resisted by a compression-steel × tension-steel couple.
  const d = geom.d_mm
  const dp = geom.d_prime_mm ?? Math.max(40, geom.clear_cover_mm + 10)
  const fy = code.fyd(mat.fy_mpa)

  const Mu2_Nmm = (Mu_kNm - cap.phi_Mn_kNm) * 1e6
  // Assume compression steel yields; caller's moment_capacity() will
  // verify via strain compatibility and adjust fs'.
  const As_prime = Mu2_Nmm / (phi_flexure * fy * (d - dp))
  const As_total = cap.As_max_mm2 + As_prime

  return {
    As_mm2: As_total,
    As_prime_mm2: As_prime,
    is_doubly_reinforced: true,
    phi_Mn_max_singly_kNm: cap.phi_Mn_kNm,
  }
}
