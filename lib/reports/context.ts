/**
 * Project snapshot used by both the PDF report generator and the AI
 * assistant's system prompt. Server-only — pulls from Supabase via the
 * service-role client so it can read across all element tables in one
 * pass without anon limits.
 *
 * Only includes fields the report or AI prompt actually need; raw
 * geometry (e.g. all diagram points) is intentionally excluded — it
 * blows the prompt context for marginal value.
 */
import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import type { CodeStandard, DesignStatus } from '@/lib/supabase/types'

export type ProjectSnapshot = {
  project: {
    id: string
    name: string
    description: string | null
    client: string | null
    location: string | null
    code_standard: CodeStandard
  }
  staad: {
    file_name: string | null
    file_hash: string | null
    synced_at: string | null
    node_count: number
    member_count: number
    mismatch_detected: boolean
    mismatch_members: number[]
  } | null
  beams: ElementSummary[]
  columns: ElementSummary[]
  slabs: SlabSummary[]
  footings: FootingSummary[]
  mto: {
    total_weight_kg: number
    largest_dia_mm: number
    rows: MtoLine[]
  }
}

export type ElementSummary = {
  id: string
  label: string
  member_ids: number[]
  section_name: string
  status: DesignStatus
  /** Governing demand summary (kN, kN·m). */
  demand?: string
  /** Capacity summary. */
  capacity?: string
  /** Pass/fail headline. */
  verdict?: string
}

export type SlabSummary = {
  id: string
  label: string
  type: string
  span_x_mm: number
  span_y_mm: number
  thickness_mm: number
  status: DesignStatus
  verdict?: string
}

export type FootingSummary = {
  id: string
  label: string
  type: string
  size_mm: string
  status: DesignStatus
  verdict?: string
}

export type MtoLine = {
  bar_dia_mm: number
  bar_mark: string
  element_label: string
  total_length_m: number
  weight_kg: number
}

export async function buildProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  const supabase = createServiceClient()

  const projectResp = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()
  if (projectResp.error) throw new Error(`project: ${projectResp.error.message}`)
  if (!projectResp.data) return null

  const [latestSync, beams, beamChecks, columns, columnChecks, slabs, slabChecks, footings, footingChecks, mto] =
    await Promise.all([
      supabase
        .from('staad_syncs')
        .select('*')
        .eq('project_id', projectId)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('beam_designs').select('*').eq('project_id', projectId).order('label'),
      supabase.from('beam_checks').select('*'),
      supabase.from('column_designs').select('*').eq('project_id', projectId).order('label'),
      supabase.from('column_checks').select('*'),
      supabase.from('slab_designs').select('*').eq('project_id', projectId).order('label'),
      supabase.from('slab_checks').select('*'),
      supabase.from('footing_designs').select('*').eq('project_id', projectId).order('label'),
      supabase.from('footing_checks').select('*'),
      supabase
        .from('material_takeoff_items')
        .select('bar_dia_mm,bar_mark,element_label,total_length_m,weight_kg')
        .eq('project_id', projectId)
        .order('bar_dia_mm'),
    ])

  const beamCheckById = new Map(
    (beamChecks.data ?? []).map((c) => [c.beam_design_id, c]),
  )
  const colCheckById = new Map(
    (columnChecks.data ?? []).map((c) => [c.column_design_id, c]),
  )
  const slabCheckById = new Map(
    (slabChecks.data ?? []).map((c) => [c.slab_design_id, c]),
  )
  const footCheckById = new Map(
    (footingChecks.data ?? []).map((c) => [c.footing_design_id, c]),
  )

  const beamSummaries: ElementSummary[] = (beams.data ?? []).map((b) => {
    const c = beamCheckById.get(b.id)
    return {
      id: b.id,
      label: b.label,
      member_ids: b.member_ids,
      section_name: b.section_name,
      status: b.design_status,
      demand: c
        ? `Mu+ ${c.mu_pos_knm.toFixed(1)} · Mu− ${c.mu_neg_knm.toFixed(1)} · Vu ${c.vu_max_kn.toFixed(1)}`
        : undefined,
      capacity: c
        ? `φMn+ ${c.phi_mn_pos_knm.toFixed(1)} · φVn ${c.phi_vn_kn.toFixed(1)}`
        : undefined,
      verdict: c?.overall_status,
    }
  })

  const columnSummaries: ElementSummary[] = (columns.data ?? []).map((col) => {
    const c = colCheckById.get(col.id)
    return {
      id: col.id,
      label: col.label,
      member_ids: col.member_ids,
      section_name: col.section_name,
      status: col.design_status,
      demand: c ? `Pu ${c.pu_kn.toFixed(1)} · Mu ${c.mu_major_knm.toFixed(1)}` : undefined,
      capacity: c
        ? `interaction ${(c.interaction_ratio * 100).toFixed(0)}% · ρ ${c.rho_percent.toFixed(2)}%`
        : undefined,
      verdict: c?.overall_status,
    }
  })

  const slabSummaries: SlabSummary[] = (slabs.data ?? []).map((s) => {
    const c = slabCheckById.get(s.id)
    return {
      id: s.id,
      label: s.label,
      type: s.slab_type,
      span_x_mm: s.span_x_mm,
      span_y_mm: s.span_y_mm,
      thickness_mm: s.thickness_mm,
      status: s.design_status,
      verdict: c?.overall_status,
    }
  })

  const footingSummaries: FootingSummary[] = (footings.data ?? []).map((f) => {
    const c = footCheckById.get(f.id)
    return {
      id: f.id,
      label: f.label,
      type: f.footing_type,
      size_mm: `${f.length_x_mm}×${f.width_y_mm}×${f.depth_mm}`,
      status: f.design_status,
      verdict: c?.overall_status,
    }
  })

  const mtoRows = mto.data ?? []
  const total_weight_kg = mtoRows.reduce((s, r) => s + r.weight_kg, 0)
  const largest_dia_mm = mtoRows.reduce((m, r) => Math.max(m, r.bar_dia_mm), 0)

  return {
    project: projectResp.data,
    staad: latestSync.data
      ? {
          file_name: latestSync.data.file_name,
          file_hash: latestSync.data.file_hash,
          synced_at: latestSync.data.synced_at,
          node_count: latestSync.data.node_count,
          member_count: latestSync.data.member_count,
          mismatch_detected: latestSync.data.mismatch_detected,
          mismatch_members: latestSync.data.mismatch_members,
        }
      : null,
    beams: beamSummaries,
    columns: columnSummaries,
    slabs: slabSummaries,
    footings: footingSummaries,
    mto: { total_weight_kg, largest_dia_mm, rows: mtoRows },
  }
}
