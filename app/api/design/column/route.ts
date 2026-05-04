/**
 * POST /api/design/column
 *
 * Runs the column design engine for a single column_design. Reads the
 * project code_standard, the column row, its reinforcement, and its
 * member envelope (from staad_envelope by any of its member_ids) to
 * obtain the governing Pu/Mu/Vu. Writes column_checks, updates
 * column_designs.design_status, and regenerates the column's MTO rows.
 *
 * Request: { project_id: string, column_design_id: string }
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

type Body = {
  project_id: string
  column_design_id: string
}

function isBody(v: unknown): v is Body {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.project_id === 'string' &&
    typeof o.column_design_id === 'string'
  )
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }
  if (!isBody(body))
    return fail('Expected { project_id, column_design_id }', 400)

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

  const { data: rebar, error: rErr } = await supabase
    .from('column_reinforcement')
    .select('*')
    .eq('column_design_id', design.id)
    .maybeSingle()
  if (rErr && rErr.code !== 'PGRST116')
    return fail(`column_reinforcement: ${rErr.message}`, 500)

  // Seed reinforcement row if absent — the UI later lets the user edit.
  let rebarRow = rebar
  if (!rebarRow) {
    const seed = await supabase
      .from('column_reinforcement')
      .insert({ column_design_id: design.id })
      .select('*')
      .single()
    if (seed.error)
      return fail(`column_reinforcement seed: ${seed.error.message}`, 500)
    rebarRow = seed.data
  }

  // Resolve demand — manual columns use stored values; STAAD-linked
  // columns aggregate from staad_envelope.
  let Pu_kN = 0
  let Mu_major_kNm = 0
  let Mu_minor_kNm = 0
  let Vu_kN = 0
  let governing_combo: number | null = null

  if (design.manual_pu_kn != null && design.manual_pu_kn > 0) {
    Pu_kN = design.manual_pu_kn
    Mu_major_kNm = design.manual_mu_major_knm ?? 0
    Mu_minor_kNm = design.manual_mu_minor_knm ?? 0
    Vu_kN = design.manual_vu_kn ?? 0
  } else if (design.member_ids.length > 0) {
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

  // Run the design.
  const d_prime = design.clear_cover_mm + rebarRow.tie_dia_mm + rebarRow.bar_dia_mm / 2

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
      bar_count: rebarRow.bar_count,
      bar_dia_mm: rebarRow.bar_dia_mm,
      type: 'tied',
    },
    tie_dia_mm: rebarRow.tie_dia_mm,
    tie_spacing_mm: rebarRow.tie_spacing_mm,
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

  const { error: sErr } = await supabase
    .from('column_designs')
    .update({
      design_status: result.overall_status,
      last_designed_at: now,
      geometry_changed: false,
    })
    .eq('id', design.id)
  if (sErr) return fail(`column_designs update: ${sErr.message}`, 500)

  // Regenerate MTO for this column.
  const mtoRows = buildColumnMto(design, rebarRow)
  const { error: delErr } = await supabase
    .from('material_takeoff_items')
    .delete()
    .eq('project_id', design.project_id)
    .eq('element_type', 'column')
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
    interaction_ratio: result.interaction_ratio,
    axial_status: result.axial_status,
    shear_status: result.shear_status,
  })
}
