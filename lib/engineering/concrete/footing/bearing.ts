/**
 * Footing bearing physics — soil pressure under the pad and bearing at
 * the column–footing interface.
 */

export type FootingGeom = {
  length_x_mm: number
  width_y_mm: number
  depth_mm: number
  clear_cover_mm: number
}

export type ColumnStub = {
  b_mm: number
  h_mm: number
}

/**
 * Net soil pressure under a concentrically loaded rectangular pad.
 * Self-weight of footing + overburden reduces the available bearing
 * capacity; the caller is expected to pass an already net allowable.
 *
 * Returns q in kPa (kN/m²).
 */
export function net_soil_pressure_kPa(
  Pu_kN: number,
  geom: FootingGeom,
): number {
  const Ax_m = geom.length_x_mm / 1000
  const Ay_m = geom.width_y_mm / 1000
  const area = Math.max(Ax_m * Ay_m, 1e-9)
  return Pu_kN / area
}

/**
 * One-way shear — critical section at d from the face of the column,
 * taken in the direction of the longer cantilever. Returns Vu in kN.
 *
 * Geometry: footing face is at x = ±Lx/2 (centred on column). Column
 * face is at x = ±b/2. Cantilever length = Lx/2 − b/2.
 * Critical section at d from column face, so the area BEYOND the
 * critical section (toward the footing edge) is:
 *   (Lx/2 − b/2 − d) × Ly
 */
export function one_way_Vu_kN(
  q_net_kPa: number,
  geom: FootingGeom,
  col: ColumnStub,
  d_mm: number,
): number {
  const cantilever_mm = (geom.length_x_mm - col.b_mm) / 2 - d_mm
  if (cantilever_mm <= 0) return 0
  const area_m2 = (cantilever_mm / 1000) * (geom.width_y_mm / 1000)
  return q_net_kPa * area_m2
}

/**
 * Two-way (punching) shear — critical perimeter at punching_d_factor·d
 * from the column face. Returns Vu in kN.
 *
 * Vu = q_net × (A_footing − A_inside_perimeter)
 */
export function two_way_Vu_kN(
  q_net_kPa: number,
  geom: FootingGeom,
  col: ColumnStub,
  d_mm: number,
  punching_d_factor: number,
): { Vu_kN: number; bo_mm: number } {
  const inset = d_mm * punching_d_factor // distance from col face to critical
  const crit_bx_mm = col.b_mm + 2 * inset
  const crit_hy_mm = col.h_mm + 2 * inset
  const A_foot_m2 = (geom.length_x_mm / 1000) * (geom.width_y_mm / 1000)
  const A_crit_m2 = (crit_bx_mm / 1000) * (crit_hy_mm / 1000)
  const Vu_kN = q_net_kPa * Math.max(0, A_foot_m2 - A_crit_m2)
  const bo_mm = 2 * crit_bx_mm + 2 * crit_hy_mm
  return { Vu_kN, bo_mm }
}

/**
 * Flexural demand at the column face, per metre width. Taken in the
 * longer direction (conservative for a rectangular footing).
 */
export function Mu_face_kNm(
  q_net_kPa: number,
  geom: FootingGeom,
  col: ColumnStub,
): number {
  // Cantilever length from column face to footing edge (mm).
  const c_mm = (geom.length_x_mm - col.b_mm) / 2
  if (c_mm <= 0) return 0
  const c_m = c_mm / 1000
  // Per metre width: Mu = q · c² / 2.
  return (q_net_kPa * c_m * c_m) / 2
}
