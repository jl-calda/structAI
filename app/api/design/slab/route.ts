/**
 * POST /api/design/slab
 * Body: { project_id, slab_design_id }
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import { runSlabDesign } from '@/lib/engineering/concrete/slab'
import { buildSlabMto } from '@/lib/mto/slabs'
import { createServiceClient } from '@/lib/supabase/service'
import type { CodeStandard } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = { project_id: string; slab_design_id: string }
function isBody(v: unknown): v is Body {
  const o = v as Record<string, unknown>
  return (
    typeof o?.project_id === 'string' &&
    typeof o?.slab_design_id === 'string'
  )
}

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid JSON body', 400) }
  if (!isBody(body)) return fail('Expected { project_id, slab_design_id }', 400)

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
    .from('slab_designs')
    .select('*')
    .eq('project_id', body.project_id)
    .eq('id', body.slab_design_id)
    .maybeSingle()
  if (dErr) return fail(`slab_designs: ${dErr.message}`, 500)
  if (!design) return fail('slab_design not found', 404)

  const rebarLookup = await supabase
    .from('slab_reinforcement')
    .select('*')
    .eq('slab_design_id', design.id)
    .maybeSingle()
  if (rebarLookup.error && rebarLookup.error.code !== 'PGRST116')
    return fail(`slab_reinforcement: ${rebarLookup.error.message}`, 500)
  let rebar = rebarLookup.data
  if (!rebar) {
    const seed = await supabase
      .from('slab_reinforcement')
      .insert({ slab_design_id: design.id })
      .select('*')
      .single()
    if (seed.error)
      return fail(`slab_reinforcement seed: ${seed.error.message}`, 500)
    rebar = seed.data
  }

  const short_mm = Math.min(design.span_x_mm, design.span_y_mm)
  const long_mm = Math.max(design.span_x_mm, design.span_y_mm)

  const result = runSlabDesign({
    type: design.slab_type,
    span: {
      short_mm,
      long_mm,
      thickness_mm: design.thickness_mm,
      clear_cover_mm: design.clear_cover_mm,
    },
    loads: {
      DL_self_kPa: design.dl_self_kpa,
      SDL_kPa: design.sdl_kpa,
      LL_kPa: design.ll_kpa,
    },
    mat: {
      fc_mpa: design.fc_mpa,
      fy_mpa: design.fy_mpa,
      fys_mpa: design.fy_mpa,
    },
    rebar: {
      bar_dia_short_mm: rebar.bar_dia_short_mm,
      spacing_short_mm: rebar.spacing_short_mm,
      bar_dia_long_mm: rebar.bar_dia_long_mm,
      spacing_long_mm: rebar.spacing_long_mm,
    },
    code,
  })

  const now = new Date().toISOString()
  const { error: cErr } = await supabase.from('slab_checks').upsert(
    {
      slab_design_id: design.id,
      mu_x_knm_per_m: result.Mu_x_kNm_per_m,
      phi_mn_x_knm_per_m: result.phi_Mn_x_kNm_per_m,
      flexure_x_status: result.flexure_x_status,
      mu_y_knm_per_m: result.Mu_y_kNm_per_m,
      phi_mn_y_knm_per_m: result.phi_Mn_y_kNm_per_m,
      flexure_y_status: result.flexure_y_status,
      vu_kn_per_m: result.Vu_kN_per_m,
      phi_vn_kn_per_m: result.phi_Vn_kN_per_m,
      shear_status: result.shear_status,
      deflection_ok: result.deflection_ok,
      code_standard: project.code_standard as CodeStandard,
      checked_at: now,
      overall_status: result.overall_status,
    },
    { onConflict: 'slab_design_id' },
  )
  if (cErr) return fail(`slab_checks: ${cErr.message}`, 500)

  const { error: uErr } = await supabase
    .from('slab_designs')
    .update({
      design_status: result.overall_status,
      last_designed_at: now,
    })
    .eq('id', design.id)
  if (uErr) return fail(`slab_designs update: ${uErr.message}`, 500)

  // Regenerate MTO.
  const mtoRows = buildSlabMto(design, rebar)
  const { error: delErr } = await supabase
    .from('material_takeoff_items')
    .delete()
    .eq('project_id', design.project_id)
    .eq('element_type', 'slab')
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
    type: result.type,
    flexure_x_status: result.flexure_x_status,
    flexure_y_status: result.flexure_y_status,
    shear_status: result.shear_status,
    deflection_ok: result.deflection_ok,
  })
}
