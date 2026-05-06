/**
 * GET /api/inspector?projectId=&kind=&id=
 *
 * Returns InspectorData for the active design (beam/column/slab/footing).
 * The Right Inspector calls this when the route changes; the layout
 * always shows the inspector but only this endpoint produces the
 * design-specific content.
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import type { InspectorData } from '@/components/shell/RightInspector'
import { getBeamDesign } from '@/lib/data/beams'
import { getColumnDesign } from '@/lib/data/columns'
import { getFootingDesign } from '@/lib/data/footings'
import { getSlabDesign } from '@/lib/data/slabs'
import { getLatestSync } from '@/lib/data/staad'
import { shortHash } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import type { BeamStirrupZone } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const projectId = sp.get('projectId') ?? ''
  const kind = sp.get('kind') ?? ''
  const id = sp.get('id') ?? ''
  if (!projectId || !kind || !id) return fail('missing query params', 400)

  const latest = await getLatestSync(projectId).catch(() => null)
  const sync: { k: string; v: string }[] | undefined = latest
    ? [
        { k: '.std', v: latest.row.file_name },
        { k: 'Hash', v: shortHash(latest.row.file_hash) },
        { k: 'Units', v: latest.row.unit_system ?? 'unknown' },
        { k: 'Last sync', v: latest.row.synced_at.slice(0, 16).replace('T', ' ') },
      ]
    : undefined

  if (kind === 'beam') return ok(await beamInspector(id, projectId, sync))
  if (kind === 'column') return ok(await columnInspector(id, sync))
  if (kind === 'slab') return ok(await slabInspector(id, sync))
  if (kind === 'footing') return ok(await footingInspector(id, sync))
  return fail('unknown kind', 400)
}

function zoneRegion(z: BeamStirrupZone): string {
  return `${Math.round(z.start_mm)}–${Math.round(z.end_mm)}`
}

function zoneNumStirrups(z: BeamStirrupZone): number {
  if (z.spacing_mm <= 0) return 0
  return Math.max(1, Math.ceil((z.end_mm - z.start_mm) / z.spacing_mm))
}

async function beamInspector(
  id: string,
  projectId: string,
  sync: { k: string; v: string }[] | undefined,
): Promise<InspectorData | null> {
  const result = await getBeamDesign(id)
  if (!result) return null
  const { design, rebar, checks } = result

  const status: 'pass' | 'fail' | 'pending' =
    design.design_status === 'pass' || design.design_status === 'fail' ? design.design_status : 'pending'

  // Pull stitched STAAD code excerpt from staad_members for these member IDs
  let staadCode = ''
  if (design.member_ids.length > 0) {
    const supabase = createServiceClient()
    const { data: members } = await supabase
      .from('staad_members')
      .select('member_id, start_node_id, end_node_id, section_name, length_mm')
      .eq('project_id', projectId)
      .in('member_id', design.member_ids)
    if (members) {
      const lines: string[] = []
      lines.push(`* Beam ${design.label}`)
      for (const m of members) {
        lines.push(`MEMBER ${m.member_id}`)
        lines.push(`START ${m.start_node_id} END ${m.end_node_id}`)
        lines.push(`PROPERTY MEMBER ${m.member_id} PRIS YD ${(design.h_mm / 1000).toFixed(2)} ZD ${(design.b_mm / 1000).toFixed(2)}`)
      }
      lines.push(`CONSTANTS MATERIAL CONCRETE`)
      lines.push(`START CONCRETE DESIGN`)
      lines.push(`  CODE NSCP 2015`)
      lines.push(`  FC ${design.fc_mpa * 1000} MEMB ${design.member_ids.join(' ')}`)
      lines.push(`  FYMAIN ${design.fy_mpa * 1000} MEMB ${design.member_ids.join(' ')}`)
      lines.push(`  CLEAR ${(design.clear_cover_mm / 1000).toFixed(3)}`)
      lines.push(`  DESIGN BEAM ${design.member_ids.join(' ')}`)
      lines.push(`END CONCRETE DESIGN`)
      staadCode = lines.join('\n')
    }
  }

  return {
    title: design.label,
    subtitle: `${design.section_name} · ${design.total_span_mm.toFixed(0)} mm`,
    status,
    identity: [
      { k: 'Section', v: design.section_name },
      { k: 'Members', v: design.member_ids.join(', ') || '—' },
      { k: 'Span L', v: `${design.total_span_mm.toFixed(0)} mm` },
    ],
    materials: [
      { k: "f'c", v: `${design.fc_mpa} MPa` },
      { k: 'fy', v: `${design.fy_mpa} MPa` },
      { k: 'Cover', v: `${design.clear_cover_mm} mm` },
    ],
    forces: checks ? [
      { k: 'M⁺ peak', v: `${checks.mu_pos_knm.toFixed(1)} kN·m` },
      { k: 'M⁻ peak', v: `${checks.mu_neg_knm.toFixed(1)} kN·m` },
      { k: 'V peak', v: `${checks.vu_max_kn.toFixed(1)} kN` },
      { k: 'Combo', v: `#${checks.mu_pos_combo ?? '—'}` },
    ] : undefined,
    reinforcement: rebar ? [
      { k: 'Perimeter', v: `4—Ø${rebar.perimeter_dia_mm}` },
      { k: 'Compression', v: rebar.compression_count > 0 ? `${rebar.compression_count}—Ø${rebar.compression_dia_mm}` : '—' },
      { k: 'Stirrup', v: `Ø${rebar.stirrup_dia_mm} ${rebar.stirrup_legs}-leg` },
    ] : undefined,
    capacity: checks ? [
      { k: 'As req', v: `${checks.as_required_mm2.toFixed(0)} mm²` },
      { k: 'As prov', v: `${checks.as_provided_mm2.toFixed(0)} mm²`, tone: 'pass' as const },
      { k: 'φMn', v: `${checks.phi_mn_pos_knm.toFixed(1)} kN·m`, tone: 'pass' as const },
      {
        k: 'Status',
        v: (checks.overall_status ?? 'pending').toUpperCase(),
        tone: checks.overall_status === 'pass' ? 'pass' as const : checks.overall_status === 'fail' ? 'fail' as const : undefined,
      },
    ] : undefined,
    staadCode,
    sync,
    checks: checks ? [
      { k: '+ Flexure', v: `φMn = ${checks.phi_mn_pos_knm.toFixed(1)} ≥ Mu = ${checks.mu_pos_knm.toFixed(1)} kN·m`, pass: checks.flexure_pos_status === 'pass' },
      { k: '− Flexure', v: `φMn = ${checks.phi_mn_neg_knm.toFixed(1)} ≥ Mu = ${checks.mu_neg_knm.toFixed(1)} kN·m`, pass: checks.flexure_neg_status === 'pass' },
      { k: 'Shear', v: `φVn = ${checks.phi_vn_kn.toFixed(1)} ≥ Vu = ${checks.vu_max_kn.toFixed(1)} kN`, pass: checks.shear_status === 'pass' },
    ] : undefined,
    stirrupZones: rebar?.stirrup_zones
      ? (rebar.stirrup_zones as BeamStirrupZone[])
          .sort((a, b) => a.start_mm - b.start_mm)
          .map((z, i) => ({
            zone: `Z${i + 1}`,
            region: zoneRegion(z),
            spacing: z.spacing_mm.toFixed(0),
            n: zoneNumStirrups(z),
          }))
      : undefined,
  }
}

async function columnInspector(
  id: string,
  sync: { k: string; v: string }[] | undefined,
): Promise<InspectorData | null> {
  const result = await getColumnDesign(id)
  if (!result) return null
  const { design, rebar, checks } = result
  const status: 'pass' | 'fail' | 'pending' =
    design.design_status === 'pass' || design.design_status === 'fail' ? design.design_status : 'pending'

  return {
    title: design.label,
    subtitle: `${design.section_name} · ${design.b_mm.toFixed(0)}×${design.h_mm.toFixed(0)} · H ${design.height_mm.toFixed(0)}`,
    status,
    identity: [
      { k: 'Section', v: design.section_name },
      { k: 'Members', v: design.member_ids.join(', ') || '—' },
      { k: 'Height', v: `${design.height_mm.toFixed(0)} mm` },
    ],
    materials: [
      { k: "f'c", v: `${design.fc_mpa} MPa` },
      { k: 'fy', v: `${design.fy_mpa} MPa` },
      { k: 'Cover', v: `${design.clear_cover_mm} mm` },
    ],
    forces: checks ? [
      { k: 'Pu', v: `${checks.pu_kn.toFixed(1)} kN` },
      { k: 'Mu major', v: `${checks.mu_major_knm.toFixed(1)} kN·m` },
      { k: 'Vu', v: `${checks.vu_kn.toFixed(1)} kN` },
      { k: 'Combo', v: `#${checks.governing_combo ?? '—'}` },
    ] : undefined,
    reinforcement: rebar ? [
      { k: 'Long. bars', v: `${rebar.bar_count}—Ø${rebar.bar_dia_mm}` },
      { k: 'Ties', v: `Ø${rebar.tie_dia_mm} @ ${rebar.tie_spacing_mm}/${rebar.tie_spacing_end_mm}` },
    ] : undefined,
    capacity: checks ? [
      { k: 'Interaction', v: `${(checks.interaction_ratio * 100).toFixed(0)}%`, tone: checks.interaction_ratio <= 1 ? 'pass' as const : 'fail' as const },
      { k: 'ρ', v: `${checks.rho_percent.toFixed(2)}%`, tone: checks.rho_min_ok && checks.rho_max_ok ? 'pass' as const : 'fail' as const },
      { k: 'Status', v: (checks.overall_status ?? 'pending').toUpperCase(), tone: checks.overall_status === 'pass' ? 'pass' as const : 'fail' as const },
    ] : undefined,
    sync,
    checks: checks ? [
      { k: 'Interaction', v: `ratio = ${(checks.interaction_ratio * 100).toFixed(0)}%`, pass: checks.interaction_ratio <= 1 },
      { k: 'Shear', v: `φVn = ${checks.phi_vn_kn.toFixed(1)} ≥ Vu = ${checks.vu_kn.toFixed(1)} kN`, pass: checks.shear_status === 'pass' },
      { k: 'Slenderness', v: `klu/r = ${checks.klu_r.toFixed(1)}`, pass: !checks.slender },
    ] : undefined,
  }
}

async function slabInspector(
  id: string,
  sync: { k: string; v: string }[] | undefined,
): Promise<InspectorData | null> {
  const result = await getSlabDesign(id)
  if (!result) return null
  const { design, rebar, checks } = result
  const status: 'pass' | 'fail' | 'pending' =
    design.design_status === 'pass' || design.design_status === 'fail' ? design.design_status : 'pending'
  const wu = 1.2 * (design.dl_self_kpa + design.sdl_kpa) + 1.6 * design.ll_kpa

  return {
    title: design.label,
    subtitle: `${design.slab_type.replace('_', '-')} · ${design.span_x_mm.toFixed(0)}×${design.span_y_mm.toFixed(0)} · t ${design.thickness_mm.toFixed(0)}`,
    status,
    identity: [
      { k: 'Type', v: design.slab_type.replace('_', '-') },
      { k: 'Lx × Ly', v: `${design.span_x_mm.toFixed(0)} × ${design.span_y_mm.toFixed(0)} mm` },
      { k: 'Thickness', v: `${design.thickness_mm.toFixed(0)} mm` },
    ],
    materials: [
      { k: "f'c", v: `${design.fc_mpa} MPa` },
      { k: 'fy', v: `${design.fy_mpa} MPa` },
      { k: 'Cover', v: `${design.clear_cover_mm} mm` },
    ],
    forces: [
      { k: 'DL self', v: `${design.dl_self_kpa.toFixed(2)} kPa` },
      { k: 'SDL', v: `${design.sdl_kpa.toFixed(2)} kPa` },
      { k: 'LL', v: `${design.ll_kpa.toFixed(2)} kPa` },
      { k: 'wu', v: `${wu.toFixed(2)} kPa` },
    ],
    reinforcement: rebar ? [
      { k: 'Short bars', v: `Ø${rebar.bar_dia_short_mm}@${rebar.spacing_short_mm}` },
      { k: 'Long bars', v: `Ø${rebar.bar_dia_long_mm}@${rebar.spacing_long_mm}` },
    ] : undefined,
    sync,
    checks: checks ? [
      { k: 'Flexure short', v: `φMn = ${checks.phi_mn_x_knm_per_m.toFixed(1)} ≥ Mu = ${checks.mu_x_knm_per_m.toFixed(1)}`, pass: checks.flexure_x_status === 'pass' },
      { k: 'Flexure long', v: `φMn = ${checks.phi_mn_y_knm_per_m.toFixed(1)} ≥ Mu = ${checks.mu_y_knm_per_m.toFixed(1)}`, pass: checks.flexure_y_status === 'pass' },
      { k: 'Shear', v: `φVn = ${checks.phi_vn_kn_per_m.toFixed(1)} ≥ Vu = ${checks.vu_kn_per_m.toFixed(1)}`, pass: checks.shear_status === 'pass' },
      { k: 'Deflection', v: checks.deflection_ok ? 'ok' : 'too thin', pass: checks.deflection_ok },
    ] : undefined,
  }
}

async function footingInspector(
  id: string,
  sync: { k: string; v: string }[] | undefined,
): Promise<InspectorData | null> {
  const result = await getFootingDesign(id)
  if (!result) return null
  const { design, checks } = result
  const status: 'pass' | 'fail' | 'pending' =
    design.design_status === 'pass' || design.design_status === 'fail' ? design.design_status : 'pending'

  return {
    title: design.label,
    subtitle: `${design.footing_type} · ${design.length_x_mm.toFixed(0)}×${design.width_y_mm.toFixed(0)}×${design.depth_mm.toFixed(0)}`,
    status,
    identity: [
      { k: 'Type', v: design.footing_type },
      { k: 'Lx × Ly', v: `${design.length_x_mm.toFixed(0)} × ${design.width_y_mm.toFixed(0)} mm` },
      { k: 'Depth', v: `${design.depth_mm.toFixed(0)} mm` },
    ],
    materials: [
      { k: "f'c", v: `${design.fc_mpa} MPa` },
      { k: 'fy', v: `${design.fy_mpa} MPa` },
      { k: 'qa', v: `${design.bearing_capacity_kpa.toFixed(1)} kPa` },
    ],
    forces: checks ? [
      { k: 'Pu', v: `${checks.pu_kn.toFixed(1)} kN` },
      { k: 'Mu', v: `${checks.mu_knm.toFixed(1)} kN·m` },
      { k: 'q net', v: `${checks.q_net_kpa.toFixed(1)} kPa` },
    ] : undefined,
    sync,
    checks: checks ? [
      { k: 'Bearing', v: `q = ${checks.q_net_kpa.toFixed(1)} ≤ qa = ${design.bearing_capacity_kpa.toFixed(1)}`, pass: checks.bearing_status === 'pass' },
      { k: 'One-way shear', v: `φVc = ${checks.phi_vn_oneway_kn.toFixed(1)} kN`, pass: checks.shear_oneway_status === 'pass' },
      { k: 'Punching', v: `φVc = ${checks.phi_vn_twoway_kn.toFixed(1)} kN`, pass: checks.shear_twoway_status === 'pass' },
      { k: 'Flexure', v: `φMn = ${checks.phi_mn_knm.toFixed(1)} ≥ Mu = ${checks.mu_face_knm.toFixed(1)}`, pass: checks.flexure_status === 'pass' },
    ] : undefined,
  }
}
