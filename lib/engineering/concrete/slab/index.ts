/**
 * Slab design — dispatches to the one-way or two-way engine based on
 * slab type + aspect ratio.
 */
import type { CodeProvider, Materials } from '@/lib/engineering/codes'

import { designOneWaySlab, type SlabCheck, type SlabLoads, type SlabRebar, type SlabSpan } from './one-way'
import { designTwoWaySlab, type TwoWaySlabCheck } from './two-way'

export type SlabType = 'one_way' | 'two_way' | 'flat_plate' | 'flat_slab'

export type SlabCheckResult = {
  type: SlabType
  wu_kPa: number
  Mu_x_kNm_per_m: number
  phi_Mn_x_kNm_per_m: number
  flexure_x_status: 'pass' | 'fail'
  Mu_y_kNm_per_m: number
  phi_Mn_y_kNm_per_m: number
  flexure_y_status: 'pass' | 'fail'
  Vu_kN_per_m: number
  phi_Vn_kN_per_m: number
  shear_status: 'pass' | 'fail'
  deflection_ok: boolean
  overall_status: 'pass' | 'fail'
}

export function runSlabDesign(input: {
  type: SlabType
  span: SlabSpan
  loads: SlabLoads
  mat: Materials
  rebar: SlabRebar
  code: CodeProvider
}): SlabCheckResult {
  const aspect = input.span.long_mm / input.span.short_mm

  // Auto-promote to one-way if aspect ratio >= 2 (long carries almost
  // no load in a two-way panel at that ratio).
  const resolved: SlabType =
    input.type === 'two_way' && aspect >= 2 ? 'one_way' : input.type

  if (resolved === 'one_way') {
    const r: SlabCheck = designOneWaySlab(input)
    return {
      type: resolved,
      wu_kPa: r.wu_kPa,
      Mu_x_kNm_per_m: r.Mu_kNm_per_m,
      phi_Mn_x_kNm_per_m: r.phi_Mn_kNm_per_m,
      flexure_x_status: r.flexure_status,
      Mu_y_kNm_per_m: 0,
      phi_Mn_y_kNm_per_m: 0,
      flexure_y_status: 'pass', // not applicable
      Vu_kN_per_m: r.Vu_kN_per_m,
      phi_Vn_kN_per_m: r.phi_Vn_kN_per_m,
      shear_status: r.shear_status,
      deflection_ok: r.deflection_ok,
      overall_status: r.overall_status,
    }
  }

  // For flat_plate / flat_slab we fall back to two-way for the MVP.
  // Punching is deferred to a future commit.
  const r: TwoWaySlabCheck = designTwoWaySlab(input)
  return {
    type: resolved,
    ...r,
  }
}

export type { SlabSpan, SlabLoads, SlabRebar }
