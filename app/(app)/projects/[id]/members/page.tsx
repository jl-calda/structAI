/**
 * Members page — STAAD member list enriched with design assignment
 * status (from beam_designs / column_designs) and governing metric
 * (Mu peak for beams, interaction ratio for columns).
 */
import { notFound } from 'next/navigation'

import { MembersTable } from '@/components/members/MembersTable'
import { listBeamDesigns } from '@/lib/data/beams'
import { listColumnDesigns } from '@/lib/data/columns'
import { getProject } from '@/lib/data/projects'
import { listMembers } from '@/lib/data/staad'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [members, beams, columns] = await Promise.all([
    listMembers(id),
    listBeamDesigns(id),
    listColumnDesigns(id),
  ])

  // Build member_id → design lookups
  const memberDesign = new Map<number, { kind: 'beam' | 'column'; status: 'pass' | 'fail' | 'warn' | 'pending'; designId: string }>()
  for (const d of beams) {
    const status = d.design_status === 'pass' ? 'pass'
      : d.design_status === 'fail' ? 'fail'
      : d.design_status === 'unverified' ? 'warn'
      : 'pending'
    for (const mid of d.member_ids) memberDesign.set(mid, { kind: 'beam', status, designId: d.id })
  }
  for (const d of columns) {
    const status = d.design_status === 'pass' ? 'pass'
      : d.design_status === 'fail' ? 'fail'
      : d.design_status === 'unverified' ? 'warn'
      : 'pending'
    for (const mid of d.member_ids) memberDesign.set(mid, { kind: 'column', status, designId: d.id })
  }

  // Pull metric values:
  // - beams: Mu peak from beam_checks via beam_design_id
  // - columns: interaction ratio from column_checks
  const supabase = createServiceClient()
  const beamIds = beams.map(b => b.id)
  const colIds = columns.map(c => c.id)
  const [beamChecksRes, colChecksRes] = await Promise.all([
    beamIds.length > 0
      ? supabase.from('beam_checks').select('beam_design_id, mu_pos_knm, mu_neg_knm').in('beam_design_id', beamIds)
      : Promise.resolve({ data: [] as { beam_design_id: string; mu_pos_knm: number; mu_neg_knm: number }[] }),
    colIds.length > 0
      ? supabase.from('column_checks').select('column_design_id, interaction_ratio').in('column_design_id', colIds)
      : Promise.resolve({ data: [] as { column_design_id: string; interaction_ratio: number }[] }),
  ])
  const beamMu = new Map<string, number>()
  for (const c of beamChecksRes.data ?? []) {
    beamMu.set(c.beam_design_id, Math.max(c.mu_pos_knm ?? 0, c.mu_neg_knm ?? 0))
  }
  const colRatio = new Map<string, number>()
  for (const c of colChecksRes.data ?? []) {
    colRatio.set(c.column_design_id, c.interaction_ratio ?? 0)
  }

  return (
    <MembersTable
      members={members.map(m => {
        const d = memberDesign.get(m.member_id)
        let metric: number | null = null
        let metric_label: 'Mu' | 'Ratio' | null = null
        if (d?.kind === 'beam') {
          const v = beamMu.get(d.designId)
          if (v != null && v > 0) { metric = v; metric_label = 'Mu' }
        } else if (d?.kind === 'column') {
          const v = colRatio.get(d.designId)
          if (v != null && v > 0) { metric = v; metric_label = 'Ratio' }
        }
        return {
          id: m.id,
          member_id: m.member_id,
          member_type: m.member_type,
          section_name: m.section_name,
          length_mm: m.length_mm,
          status: d?.status ?? 'pending',
          metric,
          metric_label,
        }
      })}
    />
  )
}
