/**
 * POST /api/design/footing
 * Body: { project_id, footing_design_id }
 *
 * Pu/Mu sourced in order of preference:
 *   1. If column_design_id is linked AND a column_checks row exists, use
 *      its governing Pu / Mu.
 *   2. Else, if node_id is set and staad_reactions has rows for that
 *      node, use the largest Ry_kN as Pu (governing combo).
 *   3. Else fail — no demand source.
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import { runFootingDesign } from '@/lib/engineering/concrete/footing'
import { buildFootingMto } from '@/lib/mto/footings'
import { createServiceClient } from '@/lib/supabase/service'
import type { CodeStandard } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = { project_id: string; footing_design_id: string }
function isBody(v: unknown): v is Body {
  const o = v as Record<string, unknown>
  return (
    typeof o?.project_id === 'string' &&
    typeof o?.footing_design_id === 'string'
  )
}

// Footings reuse the bottom-mat spacing stored transiently on the
// footing_designs row via a rebar side-table. For Phase 4b MVP we
// keep a single fixed bar + spacing in code and allow the UI to
// edit those in a later commit.
const DEFAULT_BAR_DIA_MM = 16
const DEFAULT_BOTTOM_SPACING_MM = 200

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid JSON body', 400) }
  if (!isBody(body)) return fail('Expected { project_id, footing_design_id }', 400)

  const supabase = createServiceClient()

  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('id, code_standard')
    .eq('id', body.project_id)
    .maybeSingle()
  if (pErr) return fail(`project: ${pErr.message}`, 500)
  if (!project) return fail('project not found', 404)

  const code = getCode(project.code_standard as CodeStandard)

  const { data: design, error: dErr } = await supabase
    .from('footing_designs')
    .select('*')
    .eq('project_id', body.project_id)
    .eq('id', body.footing_design_id)
    .maybeSingle()
  if (dErr) return fail(`footing_designs: ${dErr.message}`, 500)
  if (!design) return fail('footing_design not found', 404)

  // Resolve column stub dimensions.
  let col_b = design.col_b_mm ?? 400
  let col_h = design.col_h_mm ?? 400
  if (design.column_design_id) {
    const { data: col, error: cErr } = await supabase
      .from('column_designs')
      .select('b_mm, h_mm')
      .eq('id', design.column_design_id)
      .maybeSingle()
    if (cErr) return fail(`column_designs: ${cErr.message}`, 500)
    if (col) {
      col_b = col.b_mm
      col_h = col.h_mm
    }
  }

  // Demand resolution: column_checks → staad_reactions → manual → fail.
  let Pu_kN = 0
  let Mu_kNm = 0
  let governing_combo: number | null = null

  if (design.column_design_id) {
    const { data: chk, error: cErr } = await supabase
      .from('column_checks')
      .select('pu_kn, mu_major_knm, governing_combo')
      .eq('column_design_id', design.column_design_id)
      .maybeSingle()
    if (cErr && cErr.code !== 'PGRST116')
      return fail(`column_checks: ${cErr.message}`, 500)
    if (chk) {
      Pu_kN = chk.pu_kn
      Mu_kNm = chk.mu_major_knm
      governing_combo = chk.governing_combo
    }
  }

  if (Pu_kN === 0 && design.node_id !== null) {
    const { data: rxs, error: rErr } = await supabase
      .from('staad_reactions')
      .select('combo_number, ry_kn, mz_knm')
      .eq('project_id', body.project_id)
      .eq('node_id', design.node_id)
    if (rErr) return fail(`staad_reactions: ${rErr.message}`, 500)
    for (const r of rxs ?? []) {
      if (r.ry_kn > Pu_kN) {
        Pu_kN = r.ry_kn
        Mu_kNm = Math.abs(r.mz_knm)
        governing_combo = r.combo_number
      }
    }
  }

  if (Pu_kN === 0 && design.manual_pu_kn != null && design.manual_pu_kn > 0) {
    Pu_kN = design.manual_pu_kn
    Mu_kNm = design.manual_mu_knm ?? 0
  }

  if (Pu_kN <= 0)
    return fail('No Pu source — link a column, set node_id, or enter manual loads.', 400)

  const result = runFootingDesign({
    geom: {
      length_x_mm: design.length_x_mm,
      width_y_mm: design.width_y_mm,
      depth_mm: design.depth_mm,
      clear_cover_mm: design.clear_cover_mm,
    },
    column: { b_mm: col_b, h_mm: col_h },
    mat: {
      fc_mpa: design.fc_mpa,
      fy_mpa: design.fy_mpa,
      fys_mpa: design.fy_mpa,
    },
    rebar: {
      bar_dia_bottom_mm: DEFAULT_BAR_DIA_MM,
      spacing_bottom_mm: DEFAULT_BOTTOM_SPACING_MM,
    },
    bearing_capacity_kPa: design.bearing_capacity_kpa,
    demand: { Pu_kN, Mu_kNm, governing_combo },
    code,
  })

  const now = new Date().toISOString()
  const { error: cErr } = await supabase.from('footing_checks').upsert(
    {
      footing_design_id: design.id,
      pu_kn: result.demand.Pu_kN,
      mu_knm: result.demand.Mu_kNm,
      governing_combo: result.demand.governing_combo,
      q_net_kpa: result.q_net_kPa,
      bearing_status: result.bearing_status,
      phi_vn_oneway_kn: result.phi_Vn_oneway_kN,
      shear_oneway_status: result.shear_oneway_status,
      phi_vn_twoway_kn: result.phi_Vn_twoway_kN,
      shear_twoway_status: result.shear_twoway_status,
      mu_face_knm: result.Mu_face_kNm,
      phi_mn_knm: result.phi_Mn_kNm,
      flexure_status: result.flexure_status,
      phi_bn_kn: result.phi_Bn_kN,
      bearing_col_status: result.bearing_col_status,
      code_standard: project.code_standard as CodeStandard,
      checked_at: now,
      overall_status: result.overall_status,
    },
    { onConflict: 'footing_design_id' },
  )
  if (cErr) return fail(`footing_checks: ${cErr.message}`, 500)

  const { error: uErr } = await supabase
    .from('footing_designs')
    .update({
      design_status: result.overall_status,
      last_designed_at: now,
    })
    .eq('id', design.id)
  if (uErr) return fail(`footing_designs update: ${uErr.message}`, 500)

  // Regenerate MTO.
  const mtoRows = buildFootingMto(
    design,
    DEFAULT_BAR_DIA_MM,
    DEFAULT_BOTTOM_SPACING_MM,
    DEFAULT_BOTTOM_SPACING_MM,
  )
  const { error: delErr } = await supabase
    .from('material_takeoff_items')
    .delete()
    .eq('project_id', design.project_id)
    .eq('element_type', 'footing')
    .eq('element_id', design.id)
  if (delErr) return fail(`mto delete: ${delErr.message}`, 500)
  if (mtoRows.length > 0) {
    const { error: mErr } = await supabase
      .from('material_takeoff_items')
      .insert(mtoRows)
    if (mErr) return fail(`mto insert: ${mErr.message}`, 500)
  }

  return ok({
    status: result.overall_status,
    bearing_status: result.bearing_status,
    shear_oneway_status: result.shear_oneway_status,
    shear_twoway_status: result.shear_twoway_status,
    flexure_status: result.flexure_status,
    bearing_col_status: result.bearing_col_status,
  })
}
