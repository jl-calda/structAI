/**
 * Per-member envelope computation.
 *
 * Reads `staad_diagram_points` for a project, folds across every
 * combination, and writes `staad_envelope` rows with the governing
 * peaks.
 *
 * Conventions (docs/03-schema.md):
 *   mpos_max_knm   = max positive mz_knm           (+M)
 *   mneg_max_knm   = max absolute value of negative mz_knm (stored positive)
 *   vu_max_kn      = max absolute value of vy_kn
 *   nu_tension_max_kn     = max positive n_kn
 *   nu_compression_max_kn = max absolute value of negative n_kn
 *
 * Upsert on (project_id, member_id) so the result is stable across
 * re-runs. The `staad_envelope` unique constraint is provided by
 * migration 0001.
 */
import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'

export type EnvelopeResult = {
  updated: number
  members: number
}

type Row = {
  member_id: number
  combo_number: number
  mz_knm: number
  vy_kn: number
  n_kn: number
}

export async function recomputeEnvelope(
  projectId: string,
): Promise<EnvelopeResult> {
  const supabase = createServiceClient()

  // Pull every diagram sample in one query. Personal-app cardinality:
  // ~hundreds of members × ~dozen combos × 11 x-ratios = low tens of
  // thousands of rows, comfortable for a single in-memory pass.
  const { data, error } = await supabase
    .from('staad_diagram_points')
    .select('member_id, combo_number, mz_knm, vy_kn, n_kn')
    .eq('project_id', projectId)
  if (error) throw new Error(`recomputeEnvelope read: ${error.message}`)

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return { updated: 0, members: 0 }

  type Peak = {
    mpos: number
    mposCombo: number | null
    mneg: number
    mnegCombo: number | null
    vu: number
    vuCombo: number | null
    nuTension: number
    nuCompression: number
  }

  const byMember = new Map<number, Peak>()

  for (const r of rows) {
    const p = byMember.get(r.member_id) ?? {
      mpos: 0,
      mposCombo: null,
      mneg: 0,
      mnegCombo: null,
      vu: 0,
      vuCombo: null,
      nuTension: 0,
      nuCompression: 0,
    }

    if (r.mz_knm > p.mpos) {
      p.mpos = r.mz_knm
      p.mposCombo = r.combo_number
    }
    const negMag = r.mz_knm < 0 ? -r.mz_knm : 0
    if (negMag > p.mneg) {
      p.mneg = negMag
      p.mnegCombo = r.combo_number
    }
    const vMag = Math.abs(r.vy_kn)
    if (vMag > p.vu) {
      p.vu = vMag
      p.vuCombo = r.combo_number
    }
    if (r.n_kn > p.nuTension) p.nuTension = r.n_kn
    const compMag = r.n_kn < 0 ? -r.n_kn : 0
    if (compMag > p.nuCompression) p.nuCompression = compMag

    byMember.set(r.member_id, p)
  }

  const now = new Date().toISOString()
  const upsertRows = Array.from(byMember.entries()).map(([memberId, p]) => ({
    project_id: projectId,
    member_id: memberId,
    mpos_max_knm: p.mpos,
    mpos_combo: p.mposCombo,
    mneg_max_knm: p.mneg,
    mneg_combo: p.mnegCombo,
    vu_max_kn: p.vu,
    vu_combo: p.vuCombo,
    nu_tension_max_kn: p.nuTension,
    nu_compression_max_kn: p.nuCompression,
    updated_at: now,
  }))

  const { error: upErr } = await supabase
    .from('staad_envelope')
    .upsert(upsertRows, { onConflict: 'project_id,member_id' })
  if (upErr) throw new Error(`recomputeEnvelope upsert: ${upErr.message}`)

  return { updated: upsertRows.length, members: upsertRows.length }
}
