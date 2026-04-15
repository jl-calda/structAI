/**
 * Isolated footing design engine. Runs bearing, one-way shear,
 * two-way (punching) shear, flexure at column face, and bearing at
 * the column–footing interface. All code constants routed through
 * the CodeProvider.
 */
import type {
  CodeProvider,
  Materials,
  SectionGeom,
} from '@/lib/engineering/codes'

import {
  Mu_face_kNm as Mu_face_kNm_fn,
  net_soil_pressure_kPa,
  one_way_Vu_kN,
  two_way_Vu_kN,
  type ColumnStub,
  type FootingGeom,
} from './bearing'

const STRIP_WIDTH_MM = 1000

export type FootingRebar = {
  bar_dia_bottom_mm: number
  spacing_bottom_mm: number
}

export type FootingDemand = {
  Pu_kN: number
  Mu_kNm: number
  governing_combo: number | null
}

export type FootingCheckResult = {
  demand: FootingDemand
  q_net_kPa: number
  bearing_status: 'pass' | 'fail'

  phi_Vn_oneway_kN: number
  shear_oneway_status: 'pass' | 'fail'

  phi_Vn_twoway_kN: number
  shear_twoway_status: 'pass' | 'fail'

  Mu_face_kNm: number
  phi_Mn_kNm: number
  flexure_status: 'pass' | 'fail'

  phi_Bn_kN: number
  bearing_col_status: 'pass' | 'fail'

  overall_status: 'pass' | 'fail'
}

function AsPerMetre(bar_dia_mm: number, spacing_mm: number): number {
  if (spacing_mm <= 0) return 0
  const area = (Math.PI * bar_dia_mm * bar_dia_mm) / 4
  return (area * STRIP_WIDTH_MM) / spacing_mm
}

export function runFootingDesign(input: {
  geom: FootingGeom
  column: ColumnStub
  mat: Materials
  rebar: FootingRebar
  bearing_capacity_kPa: number
  demand: FootingDemand
  code: CodeProvider
}): FootingCheckResult {
  const { geom, column, mat, rebar, bearing_capacity_kPa, demand, code } = input

  const d_mm =
    geom.depth_mm - geom.clear_cover_mm - rebar.bar_dia_bottom_mm / 2

  // 1. Net soil pressure.
  const q_net_kPa = net_soil_pressure_kPa(demand.Pu_kN, geom)
  const bearing_status: 'pass' | 'fail' =
    q_net_kPa <= bearing_capacity_kPa ? 'pass' : 'fail'

  // 2. One-way shear at d from column face, across the full width.
  const Vu_oneway_kN = one_way_Vu_kN(q_net_kPa, geom, column, d_mm)
  const phi_Vn_oneway_kN = code.Vc_slab_oneway(
    mat.fc_mpa,
    geom.width_y_mm,
    d_mm,
  )
  const shear_oneway_status: 'pass' | 'fail' =
    phi_Vn_oneway_kN >= Vu_oneway_kN ? 'pass' : 'fail'

  // 3. Two-way (punching) shear at punching_d_factor·d from column face.
  const { Vu_kN: Vu_twoway_kN, bo_mm } = two_way_Vu_kN(
    q_net_kPa,
    geom,
    column,
    d_mm,
    code.punching_d_factor(),
  )
  const beta_c = Math.max(column.b_mm, column.h_mm) / Math.min(column.b_mm, column.h_mm)
  const phi_Vn_twoway_kN = code.Vc_slab_twoway(
    mat.fc_mpa,
    bo_mm,
    d_mm,
    beta_c,
  )
  const shear_twoway_status: 'pass' | 'fail' =
    phi_Vn_twoway_kN >= Vu_twoway_kN ? 'pass' : 'fail'

  // 4. Flexure at column face.
  const Mu_face = Mu_face_kNm_fn(q_net_kPa, geom, column)
  const As_prov = AsPerMetre(rebar.bar_dia_bottom_mm, rebar.spacing_bottom_mm)
  const flexGeom: SectionGeom = {
    b_mm: STRIP_WIDTH_MM,
    h_mm: geom.depth_mm,
    d_mm,
    clear_cover_mm: geom.clear_cover_mm,
  }
  const cap = code.moment_capacity(As_prov, 0, flexGeom, mat)
  const phi_Mn = cap.phi_Mn_kNm
  const flexure_status: 'pass' | 'fail' = phi_Mn >= Mu_face ? 'pass' : 'fail'

  // 5. Bearing at column–footing interface.
  const A1 = column.b_mm * column.h_mm
  const A2 = Math.min(geom.length_x_mm * geom.width_y_mm, 4 * A1)
  const phi_Bn = code.bearing_capacity(mat.fc_mpa, A1, A2)
  const bearing_col_status: 'pass' | 'fail' =
    phi_Bn >= demand.Pu_kN ? 'pass' : 'fail'

  const overall_status: 'pass' | 'fail' =
    bearing_status === 'pass' &&
    shear_oneway_status === 'pass' &&
    shear_twoway_status === 'pass' &&
    flexure_status === 'pass' &&
    bearing_col_status === 'pass'
      ? 'pass'
      : 'fail'

  return {
    demand,
    q_net_kPa,
    bearing_status,
    phi_Vn_oneway_kN,
    shear_oneway_status,
    phi_Vn_twoway_kN,
    shear_twoway_status,
    Mu_face_kNm: Mu_face,
    phi_Mn_kNm: phi_Mn,
    flexure_status,
    phi_Bn_kN: phi_Bn,
    bearing_col_status,
    overall_status,
  }
}

export type { FootingGeom, ColumnStub }
