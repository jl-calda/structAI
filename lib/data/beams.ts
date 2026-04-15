/**
 * Beam read helpers. Server-only.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type BeamDesignRow = Database['public']['Tables']['beam_designs']['Row']
export type BeamReinforcementRow =
  Database['public']['Tables']['beam_reinforcement']['Row']
export type BeamCheckRow = Database['public']['Tables']['beam_checks']['Row']

export async function listBeamDesigns(
  projectId: string,
): Promise<BeamDesignRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('beam_designs')
    .select('*')
    .eq('project_id', projectId)
    .order('label', { ascending: true })
  if (error) throw new Error(`listBeamDesigns: ${error.message}`)
  return data ?? []
}

export async function getBeamDesign(id: string): Promise<{
  design: BeamDesignRow
  rebar: BeamReinforcementRow | null
  checks: BeamCheckRow | null
} | null> {
  const supabase = await createClient()
  const [design, rebar, checks] = await Promise.all([
    supabase.from('beam_designs').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('beam_reinforcement')
      .select('*')
      .eq('beam_design_id', id)
      .maybeSingle(),
    supabase
      .from('beam_checks')
      .select('*')
      .eq('beam_design_id', id)
      .maybeSingle(),
  ])
  if (design.error) throw new Error(`getBeamDesign: ${design.error.message}`)
  if (!design.data) return null
  if (rebar.error && rebar.error.code !== 'PGRST116')
    throw new Error(`rebar: ${rebar.error.message}`)
  if (checks.error && checks.error.code !== 'PGRST116')
    throw new Error(`checks: ${checks.error.message}`)
  return {
    design: design.data,
    rebar: rebar.data ?? null,
    checks: checks.data ?? null,
  }
}

/**
 * Stitched diagram for a beam — the actual M(x)/V(x) the engine reads.
 * Loads each member's diagram_points in project order, concatenates by
 * member order in `member_ids`, and returns samples at absolute x_mm.
 */
export async function getBeamStitchedDiagram(
  design: Pick<BeamDesignRow, 'project_id' | 'member_ids'>,
): Promise<{ x_mm: number; mz_knm: number; vy_kn: number; combo_number: number }[]> {
  const supabase = await createClient()
  const { data: members, error: mErr } = await supabase
    .from('staad_members')
    .select('member_id, length_mm')
    .eq('project_id', design.project_id)
    .in('member_id', design.member_ids)
  if (mErr) throw new Error(`members: ${mErr.message}`)

  const memberLen = new Map<number, number>()
  for (const m of members ?? []) memberLen.set(m.member_id, m.length_mm)

  const { data: points, error: pErr } = await supabase
    .from('staad_diagram_points')
    .select('member_id, combo_number, x_ratio, mz_knm, vy_kn')
    .eq('project_id', design.project_id)
    .in('member_id', design.member_ids)
  if (pErr) throw new Error(`diagram: ${pErr.message}`)

  const byMember = new Map<
    number,
    { combo_number: number; x_ratio: number; mz_knm: number; vy_kn: number }[]
  >()
  for (const p of points ?? []) {
    const arr = byMember.get(p.member_id) ?? []
    arr.push(p)
    byMember.set(p.member_id, arr)
  }

  const stitched: {
    x_mm: number
    mz_knm: number
    vy_kn: number
    combo_number: number
  }[] = []
  let offset = 0
  for (const id of design.member_ids) {
    const len = memberLen.get(id) ?? 0
    const pts = byMember.get(id) ?? []
    for (const p of pts) {
      stitched.push({
        x_mm: offset + p.x_ratio * len,
        mz_knm: p.mz_knm,
        vy_kn: p.vy_kn,
        combo_number: p.combo_number,
      })
    }
    offset += len
  }
  return stitched
}

/**
 * Fold the stitched diagram to produce just the positive-moment and
 * negative-moment envelope curves (for plotting). Keeps the two
 * extremes over all combos at each sample x.
 */
export function foldMomentEnvelope(
  stitched: { x_mm: number; mz_knm: number }[],
): { x_mm: number; Mpos: number; Mneg: number }[] {
  const byX = new Map<number, { Mpos: number; Mneg: number }>()
  for (const p of stitched) {
    const cur = byX.get(p.x_mm) ?? { Mpos: 0, Mneg: 0 }
    if (p.mz_knm > cur.Mpos) cur.Mpos = p.mz_knm
    if (p.mz_knm < cur.Mneg) cur.Mneg = p.mz_knm
    byX.set(p.x_mm, cur)
  }
  return Array.from(byX.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([x, v]) => ({ x_mm: x, Mpos: v.Mpos, Mneg: v.Mneg }))
}

export function foldShearEnvelope(
  stitched: { x_mm: number; vy_kn: number }[],
): { x_mm: number; Vpos: number; Vneg: number }[] {
  const byX = new Map<number, { Vpos: number; Vneg: number }>()
  for (const p of stitched) {
    const cur = byX.get(p.x_mm) ?? { Vpos: 0, Vneg: 0 }
    if (p.vy_kn > cur.Vpos) cur.Vpos = p.vy_kn
    if (p.vy_kn < cur.Vneg) cur.Vneg = p.vy_kn
    byX.set(p.x_mm, cur)
  }
  return Array.from(byX.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([x, v]) => ({ x_mm: x, Vpos: v.Vpos, Vneg: v.Vneg }))
}
