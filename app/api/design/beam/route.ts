/**
 * POST /api/design/beam
 *
 * Runs the beam group design engine for the supplied beam_design_ids.
 * All IDs must belong to the same project. Reads:
 *   - beam_designs for section/material/length/member_ids
 *   - staad_diagram_points for each beam's member_ids (stitched in order)
 *   - projects for code_standard
 * Writes:
 *   - beam_reinforcement (shared rebar config; upsert on beam_design_id)
 *   - beam_checks (one row per beam; upsert on beam_design_id)
 *   - beam_designs.design_status + last_designed_at
 *
 * See docs/08-routes.md and docs/05-beam-engine.md.
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import '@/lib/engineering/codes/aci318-19' // side-effect register
import '@/lib/engineering/codes/nscp2015'  // side-effect register
import { getCode } from '@/lib/engineering/codes'
import {
  runBeamGroupDesign,
  type BeamGroupInput,
  type BeamInput,
  type BeamDiagramSample,
} from '@/lib/engineering/concrete/beam/group-engine'
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
  beam_design_ids: string[]
}

function isBody(v: unknown): v is Body {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.project_id === 'string' &&
    Array.isArray(o.beam_design_ids) &&
    o.beam_design_ids.every((x) => typeof x === 'string')
  )
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }
  if (!isBody(body)) return fail('Expected { project_id, beam_design_ids }', 400)
  if (body.beam_design_ids.length === 0)
    return fail('beam_design_ids must be non-empty', 400)

  const supabase = createServiceClient()

  // 1. Project (for code_standard).
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, code_standard')
    .eq('id', body.project_id)
    .maybeSingle()
  if (projErr) return fail(`project: ${projErr.message}`, 500)
  if (!project) return fail('project not found', 404)

  const code = getCode(project.code_standard as CodeStandard)

  // 2. Beam rows in the group.
  const { data: designs, error: dErr } = await supabase
    .from('beam_designs')
    .select('*')
    .eq('project_id', body.project_id)
    .in('id', body.beam_design_ids)
  if (dErr) return fail(`beam_designs: ${dErr.message}`, 500)
  if (!designs || designs.length !== body.beam_design_ids.length) {
    return fail('some beam_design_ids not found in project', 404)
  }

  // 3. Diagram points for every member referenced by the group.
  const allMemberIds = Array.from(
    new Set(designs.flatMap((d) => d.member_ids)),
  )
  const { data: points, error: pErr } = await supabase
    .from('staad_diagram_points')
    .select('member_id, combo_number, x_ratio, x_mm, mz_knm, vy_kn')
    .eq('project_id', body.project_id)
    .in('member_id', allMemberIds)
  if (pErr) return fail(`diagram_points: ${pErr.message}`, 500)

  // Group per member.
  const byMember = new Map<
    number,
    {
      combo_number: number
      x_ratio: number
      x_mm: number
      mz_knm: number
      vy_kn: number
    }[]
  >()
  for (const p of points ?? []) {
    const arr = byMember.get(p.member_id) ?? []
    arr.push(p)
    byMember.set(p.member_id, arr)
  }

  // Stitch each beam's diagram end-to-end.
  const memberLengths = new Map<number, number>()
  {
    const { data: members, error: mErr } = await supabase
      .from('staad_members')
      .select('member_id, length_mm')
      .eq('project_id', body.project_id)
      .in('member_id', allMemberIds)
    if (mErr) return fail(`staad_members: ${mErr.message}`, 500)
    for (const m of members ?? []) memberLengths.set(m.member_id, m.length_mm)
  }

  const beams: BeamInput[] = designs.map((d) => {
    const memberLens = d.member_ids.map((id) => memberLengths.get(id) ?? 0)
    const total_span_mm = memberLens.reduce((a, b) => a + b, 0)

    const diagram: BeamDiagramSample[] = []
    let offset = 0
    for (let i = 0; i < d.member_ids.length; i++) {
      const id = d.member_ids[i]
      const len = memberLens[i]
      const memberPoints = byMember.get(id) ?? []
      for (const p of memberPoints) {
        diagram.push({
          x_mm: offset + p.x_ratio * len,
          Mz_kNm: p.mz_knm,
          Vy_kN: p.vy_kn,
          combo_number: p.combo_number,
        })
      }
      offset += len
    }

    return {
      label: d.label,
      member_ids: d.member_ids,
      member_lengths_mm: memberLens,
      total_span_mm,
      geom: {
        b_mm: d.b_mm,
        h_mm: d.h_mm,
        d_mm: d.h_mm - d.clear_cover_mm - 25, // rough — caller may refine
        clear_cover_mm: d.clear_cover_mm,
      },
      mat: {
        fc_mpa: d.fc_mpa,
        fy_mpa: d.fy_mpa,
        fys_mpa: d.fys_mpa,
      },
      diagram,
    }
  })

  // 4. Run the engine with conservative starting rebar.
  const group: BeamGroupInput = {
    beams,
    starting_rebar: {
      perimeter_dia_mm: 20,
      tension_layers: [],
      compression_dia_mm: 20,
      compression_count: 0,
      stirrup_dia_mm: 10,
      stirrup_legs: 2,
    },
    code,
    dense_spacing_mm: 100,
    mid_spacing_mm: 200,
  }
  const result = runBeamGroupDesign(group)

  // 5. Persist. Each beam_design gets one reinforcement row (shared
  //    shape, but bend points are attached to each tension layer per
  //    beam — we store the bend points from that beam's own check).
  const now = new Date().toISOString()

  for (let i = 0; i < designs.length; i++) {
    const d = designs[i]
    const check = result.checks[i]

    // Per-beam bend points injected into the bent_down layers.
    const tension_layers: BeamTensionLayer[] = result.rebar.tension_layers.map(
      (l) => ({
        layer: l.layer,
        dia_mm: l.dia_mm,
        count: l.count,
        bent_down: l.bent_down,
        bend_point_left_mm: l.bent_down ? check.bend_points.bend_point_left_mm : undefined,
        bend_point_right_mm: l.bent_down ? check.bend_points.bend_point_right_mm : undefined,
      }),
    )

    const stirrup_zones: BeamStirrupZone[] = check.stirrup_zones

    const { error: rErr } = await supabase
      .from('beam_reinforcement')
      .upsert(
        {
          beam_design_id: d.id,
          perimeter_dia_mm: result.rebar.perimeter_dia_mm,
          tension_layers,
          compression_dia_mm: result.rebar.compression_dia_mm,
          compression_count: result.rebar.compression_count,
          stirrup_dia_mm: result.rebar.stirrup_dia_mm,
          stirrup_legs: result.rebar.stirrup_legs,
          stirrup_zones,
        },
        { onConflict: 'beam_design_id' },
      )
    if (rErr) return fail(`beam_reinforcement: ${rErr.message}`, 500)

    const overall =
      check.flexure_pos_status === 'fail' ||
      check.flexure_neg_status === 'fail' ||
      check.shear_status === 'fail'
        ? 'fail'
        : 'pass'

    const { error: cErr } = await supabase.from('beam_checks').upsert(
      {
        beam_design_id: d.id,
        mu_pos_knm: check.Mu_pos_kNm,
        mu_pos_combo: check.Mu_pos_combo,
        mu_neg_knm: check.Mu_neg_kNm,
        mu_neg_combo: check.Mu_neg_combo,
        vu_max_kn: check.Vu_max_kN,
        vu_combo: check.Vu_combo,
        d_mm: d.h_mm - d.clear_cover_mm - 25,
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

    const { error: sErr } = await supabase
      .from('beam_designs')
      .update({
        design_status: overall,
        last_designed_at: now,
        geometry_changed: false,
      })
      .eq('id', d.id)
    if (sErr) return fail(`beam_designs update: ${sErr.message}`, 500)
  }

  return ok({
    status: result.status,
    iterations: result.iterations,
    reason: result.reason ?? null,
    beams: result.checks.map((c) => ({
      label: c.label,
      overall:
        c.flexure_pos_status === 'fail' ||
        c.flexure_neg_status === 'fail' ||
        c.shear_status === 'fail'
          ? 'fail'
          : 'pass',
    })),
  })
}
