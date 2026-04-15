/**
 * POST /api/design/column/check
 *
 * Re-check a single column against a user-supplied rebar configuration.
 * Body:
 *   {
 *     project_id: string,
 *     column_design_id: string,
 *     rebar: {
 *       bar_dia_mm: number,
 *       bar_count: number,
 *       tie_dia_mm: number,
 *       tie_spacing_mm: number,
 *       tie_spacing_end_mm: number,
 *       tie_end_zone_length_mm: number,
 *     }
 *   }
 *
 * Runs `runColumnDesign` with the user's rebar and the existing governing
 * demand (from column_checks, or freshly pulled from staad_envelope if
 * no checks yet). Persists the rebar, updated checks, and regenerated
 * MTO. Mirrors the beam check route.
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import { runColumnDesign } from '@/lib/engineering/concrete/column'
import { buildColumnMto } from '@/lib/mto/columns'
import { createServiceClient } from '@/lib/supabase/service'
import type { CodeStandard } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RebarBody = {
  bar_dia_mm: number
  bar_count: number
  tie_dia_mm: number
  tie_spacing_mm: number
  tie_spacing_end_mm: number
  tie_end_zone_length_mm: number
}

type Body = {
  project_id: string
  column_design_id: string
  rebar: RebarBody
}

function isBody(v: unknown): v is Body {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.project_id !== 'string') return false
  if (typeof o.column_design_id !== 'string') return false
  const r = o.rebar as Record<string, unknown> | undefined
  if (!r) return false
  return (
    typeof r.bar_dia_mm === 'number' &&
    typeof r.bar_count === 'number' &&
    typeof r.tie_dia_mm === 'number' &&
    typeof r.tie_spacing_mm === 'number' &&
    typeof r.tie_spacing_end_mm === 'number' &&
    typeof r.tie_end_zone_length_mm === 'number'
  )
}

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid JSON body', 400) }
  if (!isBody(body)) return fail('Expected { project_id, column_design_id, rebar }', 400)

  const supabase = createServiceClient()

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, code_standard')
    .eq('id', body.project_id)
    .maybeSingle()
  if (projErr) return fail(`project: ${projErr.message}`, 500)
  if (!project) return fail('project not found', 404)
  const code = getCode(project.code_standard as CodeStandard)

  const { data: design, error: dErr } = await supabase
    .from('column_designs')
    .select('*')
    .eq('project_id', body.project_id)
    .eq('id', body.column_design_id)
    .maybeSingle()
  if (dErr) return fail(`column_designs: ${dErr.message}`, 500)
  if (!design) return fail('column_design not found', 404)

  // Demand: try existing column_checks first; fall back to envelope scan.
  let Pu_kN = 0
  let Mu_major_kNm = 0
  let Mu_minor_kNm = 0
  let Vu_kN = 0
  let governing_combo: number | null = null

  const { data: existingChecks } = await supabase
    .from('column_checks')
    .select('pu_kn, mu_major_knm, mu_minor_knm, vu_kn, governing_combo')
    .eq('column_design_id', design.id)
    .maybeSingle()
  if (existingChecks) {
    Pu_kN = existingChecks.pu_kn
    Mu_major_kNm = existingChecks.mu_major_knm
    Mu_minor_kNm = existingChecks.mu_minor_knm
    Vu_kN = existingChecks.vu_kn
    governing_combo = existingChecks.governing_combo
  } else {
    const { data: env, error: eErr } = await supabase
      .from('staad_envelope')
      .select('*')
      .eq('project_id', body.project_id)
      .in('member_id', design.member_ids)
    if (eErr) return fail(`staad_envelope: ${eErr.message}`, 500)
    for (const e of env ?? []) {
      const pcand = Math.max(e.nu_compression_max_kn, 0)
      if (pcand > Pu_kN) Pu_kN = pcand
      const mMax = Math.max(e.mpos_max_knm, e.mneg_max_knm)
      if (mMax > Mu_major_kNm) {
        Mu_major_kNm = mMax
        governing_combo = e.mpos_max_knm >= e.mneg_max_knm ? e.mpos_combo : e.mneg_combo
      }
      const mMinor = Math.max(e.mpos_max_minor_knm, e.mneg_max_minor_knm)
      if (mMinor > Mu_minor_kNm) Mu_minor_kNm = mMinor
      if (e.vu_max_kn > Vu_kN) Vu_kN = e.vu_max_kn
    }
  }

  const d_prime = design.clear_cover_mm + body.rebar.tie_dia_mm + body.rebar.bar_dia_mm / 2

  const result = runColumnDesign({
    label: design.label,
    section: {
      b_mm: design.b_mm,
      h_mm: design.h_mm,
      d_prime_mm: d_prime,
      clear_cover_mm: design.clear_cover_mm,
    },
    height_mm: design.height_mm,
    mat: {
      fc_mpa: design.fc_mpa,
      fy_mpa: design.fy_mpa,
      fys_mpa: design.fys_mpa,
    },
    rebar: {
      bar_count: body.rebar.bar_count,
      bar_dia_mm: body.rebar.bar_dia_mm,
      type: 'tied',
    },
    tie_dia_mm: body.rebar.tie_dia_mm,
    tie_spacing_mm: body.rebar.tie_spacing_mm,
    demand: {
      Pu_kN,
      Mu_major_kNm,
      Mu_minor_kNm,
      Vu_kN,
      governing_combo,
    },
    code,
  })

  const now = new Date().toISOString()

  const { error: rErr } = await supabase.from('column_reinforcement').upsert(
    {
      column_design_id: design.id,
      bar_dia_mm: body.rebar.bar_dia_mm,
      bar_count: body.rebar.bar_count,
      tie_dia_mm: body.rebar.tie_dia_mm,
      tie_spacing_mm: body.rebar.tie_spacing_mm,
      tie_spacing_end_mm: body.rebar.tie_spacing_end_mm,
      tie_end_zone_length_mm: body.rebar.tie_end_zone_length_mm,
    },
    { onConflict: 'column_design_id' },
  )
  if (rErr) return fail(`column_reinforcement: ${rErr.message}`, 500)

  const { error: cErr } = await supabase.from('column_checks').upsert(
    {
      column_design_id: design.id,
      pu_kn: result.demand.Pu_kN,
      mu_major_knm: result.demand.Mu_major_kNm,
      mu_minor_knm: result.demand.Mu_minor_kNm,
      governing_combo: result.demand.governing_combo,
      phi_pn_kn: result.phi_Pn_kN,
      phi_mn_knm: result.phi_Mn_kNm,
      interaction_ratio: result.interaction_ratio,
      axial_status: result.axial_status,
      vu_kn: result.demand.Vu_kN,
      phi_vn_kn: result.phi_Vn_kN,
      shear_status: result.shear_status,
      rho_percent: result.rho_percent,
      rho_min_ok: result.rho_min_ok,
      rho_max_ok: result.rho_max_ok,
      klu_r: result.klu_r,
      slender: result.slender,
      code_standard: project.code_standard as CodeStandard,
      checked_at: now,
      overall_status: result.overall_status,
    },
    { onConflict: 'column_design_id' },
  )
  if (cErr) return fail(`column_checks: ${cErr.message}`, 500)

  const { error: uErr } = await supabase
    .from('column_designs')
    .update({
      design_status: result.overall_status,
      last_designed_at: now,
      geometry_changed: false,
    })
    .eq('id', design.id)
  if (uErr) return fail(`column_designs update: ${uErr.message}`, 500)

  // Regenerate MTO.
  const mtoRows = buildColumnMto(design, {
    id: '',
    column_design_id: design.id,
    bar_dia_mm: body.rebar.bar_dia_mm,
    bar_count: body.rebar.bar_count,
    tie_dia_mm: body.rebar.tie_dia_mm,
    tie_spacing_mm: body.rebar.tie_spacing_mm,
    tie_spacing_end_mm: body.rebar.tie_spacing_end_mm,
    tie_end_zone_length_mm: body.rebar.tie_end_zone_length_mm,
    is_seismic: false,
  })
  await supabase
    .from('material_takeoff_items')
    .delete()
    .eq('project_id', design.project_id)
    .eq('element_type', 'column')
    .eq('element_id', design.id)
  if (mtoRows.length > 0) {
    await supabase.from('material_takeoff_items').insert(mtoRows)
  }

  return ok({
    overall: result.overall_status,
    axial_status: result.axial_status,
    shear_status: result.shear_status,
    interaction_ratio: result.interaction_ratio,
    rho_percent: result.rho_percent,
    rho_min_ok: result.rho_min_ok,
    rho_max_ok: result.rho_max_ok,
  })
}
