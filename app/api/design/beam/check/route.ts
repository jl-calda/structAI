/**
 * POST /api/design/beam/check
 *
 * Re-check a single beam against a user-supplied rebar configuration
 * without running the group iteration. Used by the beam design page's
 * rebar editor — user tweaks bars, clicks "Re-check", sees the updated
 * verdict immediately.
 *
 * Body:
 *   {
 *     project_id: string,
 *     beam_design_id: string,
 *     rebar: BeamRebarConfig
 *   }
 *
 * What it does:
 *   - Stitch the beam's M(x)/V(x) diagram from staad_diagram_points.
 *   - Run `check_beam` with the user's rebar (single pass, no seeding).
 *   - Persist the new rebar to beam_reinforcement and the new checks
 *     to beam_checks. Update beam_designs.design_status.
 *   - Regenerate MTO for this beam only.
 *
 * The full group-design endpoint (POST /api/design/beam) stays the
 * authoritative "design from scratch" path. This endpoint is the
 * authoritative "I know what I want, verify it" path.
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import '@/lib/engineering/codes/aci318-19'
import '@/lib/engineering/codes/nscp2015'
import { getCode } from '@/lib/engineering/codes'
import {
  check_beam,
  type BeamDiagramSample,
  type BeamInput,
  type BeamRebarConfig,
} from '@/lib/engineering/concrete/beam/group-engine'
import { buildBeamMto } from '@/lib/mto/beams'
import { createServiceClient } from '@/lib/supabase/service'
import type {
  BeamStirrupZone,
  BeamTensionLayer,
  CodeStandard,
} from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  project_id: string
  beam_design_id: string
  rebar: BeamRebarConfig
}

function isBody(v: unknown): v is Body {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.project_id !== 'string') return false
  if (typeof o.beam_design_id !== 'string') return false
  const r = o.rebar as Record<string, unknown> | undefined
  if (!r) return false
  return (
    typeof r.perimeter_dia_mm === 'number' &&
    Array.isArray(r.tension_layers) &&
    typeof r.compression_dia_mm === 'number' &&
    typeof r.compression_count === 'number' &&
    typeof r.stirrup_dia_mm === 'number' &&
    typeof r.stirrup_legs === 'number'
  )
}

const DENSE_SPACING_MM = 100
const MID_SPACING_MM = 200

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid JSON body', 400) }
  if (!isBody(body)) return fail('Expected { project_id, beam_design_id, rebar }', 400)

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
    .from('beam_designs')
    .select('*')
    .eq('project_id', body.project_id)
    .eq('id', body.beam_design_id)
    .maybeSingle()
  if (dErr) return fail(`beam_designs: ${dErr.message}`, 500)
  if (!design) return fail('beam_design not found', 404)

  // Stitch the diagram — same logic as the group endpoint.
  const { data: members, error: mErr } = await supabase
    .from('staad_members')
    .select('member_id, length_mm')
    .eq('project_id', body.project_id)
    .in('member_id', design.member_ids)
  if (mErr) return fail(`staad_members: ${mErr.message}`, 500)
  const memberLen = new Map(
    (members ?? []).map((m) => [m.member_id, m.length_mm]),
  )

  const { data: points, error: pErr } = await supabase
    .from('staad_diagram_points')
    .select('member_id, combo_number, x_ratio, mz_knm, vy_kn')
    .eq('project_id', body.project_id)
    .in('member_id', design.member_ids)
  if (pErr) return fail(`diagram_points: ${pErr.message}`, 500)

  const byMember = new Map<number, typeof points>()
  for (const p of points ?? []) {
    const arr = byMember.get(p.member_id) ?? []
    arr.push(p)
    byMember.set(p.member_id, arr)
  }

  const diagram: BeamDiagramSample[] = []
  let offset = 0
  for (const id of design.member_ids) {
    const len = memberLen.get(id) ?? 0
    const pts = byMember.get(id) ?? []
    for (const p of pts) {
      diagram.push({
        x_mm: offset + p.x_ratio * len,
        Mz_kNm: p.mz_knm,
        Vy_kN: p.vy_kn,
        combo_number: p.combo_number,
      })
    }
    offset += len
  }

  const beam: BeamInput = {
    label: design.label,
    member_ids: design.member_ids,
    member_lengths_mm: design.member_ids.map((id) => memberLen.get(id) ?? 0),
    total_span_mm: design.total_span_mm,
    geom: {
      b_mm: design.b_mm,
      h_mm: design.h_mm,
      d_mm: design.h_mm - design.clear_cover_mm - 25,
      clear_cover_mm: design.clear_cover_mm,
    },
    mat: {
      fc_mpa: design.fc_mpa,
      fy_mpa: design.fy_mpa,
      fys_mpa: design.fys_mpa,
    },
    diagram,
  }

  const check = check_beam(
    beam,
    body.rebar,
    DENSE_SPACING_MM,
    MID_SPACING_MM,
    code,
  )

  const now = new Date().toISOString()
  const overall: 'pass' | 'fail' =
    check.flexure_pos_status === 'fail' ||
    check.flexure_neg_status === 'fail' ||
    check.shear_status === 'fail'
      ? 'fail'
      : 'pass'

  // Persist the user's rebar + the new bend points.
  const tension_layers: BeamTensionLayer[] = body.rebar.tension_layers.map((l) => ({
    layer: l.layer,
    dia_mm: l.dia_mm,
    count: l.count,
    bent_down: l.bent_down,
    bend_point_left_mm: l.bent_down ? check.bend_points.bend_point_left_mm : undefined,
    bend_point_right_mm: l.bent_down ? check.bend_points.bend_point_right_mm : undefined,
  }))
  const stirrup_zones: BeamStirrupZone[] = check.stirrup_zones

  const { error: rErr } = await supabase.from('beam_reinforcement').upsert(
    {
      beam_design_id: design.id,
      perimeter_dia_mm: body.rebar.perimeter_dia_mm,
      tension_layers,
      compression_dia_mm: body.rebar.compression_dia_mm,
      compression_count: body.rebar.compression_count,
      stirrup_dia_mm: body.rebar.stirrup_dia_mm,
      stirrup_legs: body.rebar.stirrup_legs,
      stirrup_zones,
    },
    { onConflict: 'beam_design_id' },
  )
  if (rErr) return fail(`beam_reinforcement: ${rErr.message}`, 500)

  const { error: cErr } = await supabase.from('beam_checks').upsert(
    {
      beam_design_id: design.id,
      mu_pos_knm: check.Mu_pos_kNm,
      mu_pos_combo: check.Mu_pos_combo,
      mu_neg_knm: check.Mu_neg_kNm,
      mu_neg_combo: check.Mu_neg_combo,
      vu_max_kn: check.Vu_max_kN,
      vu_combo: check.Vu_combo,
      d_mm: design.h_mm - design.clear_cover_mm - 25,
      as_required_mm2: check.As_required_mm2,
      as_provided_mm2: check.As_provided_mm2,
      phi_mn_pos_knm: check.phi_Mn_pos_kNm,
      flexure_pos_status: check.flexure_pos_status,
      phi_mn_neg_knm: check.phi_Mn_neg_kNm,
      flexure_neg_status: check.flexure_neg_status,
      is_doubly_reinforced: check.is_doubly_reinforced,
      phi_mn_max_singly_knm: check.phi_Mn_max_singly_kNm,
      phi_vn_kn: check.phi_Vn_support_kN,
      shear_status: check.shear_status,
      bend_point_left_mm: check.bend_points.bend_point_left_mm,
      bend_point_right_mm: check.bend_points.bend_point_right_mm,
      perimeter_only_phi_mn_knm: check.perimeter_only_phi_Mn_kNm,
      code_standard: project.code_standard as CodeStandard,
      checked_at: now,
      overall_status: overall,
    },
    { onConflict: 'beam_design_id' },
  )
  if (cErr) return fail(`beam_checks: ${cErr.message}`, 500)

  const { error: uErr } = await supabase
    .from('beam_designs')
    .update({
      design_status: overall,
      last_designed_at: now,
      geometry_changed: false,
    })
    .eq('id', design.id)
  if (uErr) return fail(`beam_designs update: ${uErr.message}`, 500)

  // Regenerate MTO for this beam.
  const mtoRows = buildBeamMto(design, {
    id: '',
    beam_design_id: design.id,
    perimeter_dia_mm: body.rebar.perimeter_dia_mm,
    tension_layers,
    compression_dia_mm: body.rebar.compression_dia_mm,
    compression_count: body.rebar.compression_count,
    stirrup_dia_mm: body.rebar.stirrup_dia_mm,
    stirrup_legs: body.rebar.stirrup_legs,
    stirrup_zones,
  })
  await supabase
    .from('material_takeoff_items')
    .delete()
    .eq('project_id', design.project_id)
    .eq('element_type', 'beam')
    .eq('element_id', design.id)
  if (mtoRows.length > 0) {
    await supabase.from('material_takeoff_items').insert(mtoRows)
  }

  return ok({
    overall,
    flexure_pos_status: check.flexure_pos_status,
    flexure_neg_status: check.flexure_neg_status,
    shear_status: check.shear_status,
    as_provided_mm2: check.As_provided_mm2,
    as_required_mm2: check.As_required_mm2,
    phi_Mn_pos_kNm: check.phi_Mn_pos_kNm,
    Mu_pos_kNm: check.Mu_pos_kNm,
    phi_Vn_kN: check.phi_Vn_support_kN,
    Vu_kN: check.Vu_max_kN,
  })
}
