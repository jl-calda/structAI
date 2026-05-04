/**
 * POST /api/bridge/sync
 *
 * Entry point for the Python STAAD bridge. Upserts the entire Object 1
 * (STAAD mirror) snapshot for a project in a single request. The caller is
 * already gated by proxy.ts (localhost only) and by the X-Bridge-Secret
 * header check below.
 *
 * See docs/08-routes.md, docs/13-bridge.md for the contract.
 *
 * Phase 1 behaviour:
 * - Append a new staad_syncs row per request.
 * - Upsert nodes, members, sections, materials, load_cases, combinations,
 *   diagram_points, envelope, reactions on their natural keys.
 * - Detect a hash mismatch against the previous sync; member-level diff is
 *   deferred to Phase 2 (populates mismatch_members then).
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import { parseSyncPayload, PayloadError } from '@/lib/bridge/payload'
import { env } from '@/lib/env'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Secret header guard — proxy.ts already handled IP.
  const secret = request.headers.get('x-bridge-secret')
  if (!secret || secret !== env.BRIDGE_SECRET) {
    return fail('Unauthorized', 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }

  let payload
  try {
    payload = parseSyncPayload(body)
  } catch (e) {
    if (e instanceof PayloadError) return fail(e.message, 400)
    throw e
  }

  const ACCEPTED_UNITS = new Set(['kN-m', 'kN-mm', 'unknown'])
  if (!ACCEPTED_UNITS.has(payload.unit_system)) {
    return fail(
      `STAAD is using "${payload.unit_system}" units. StructAI requires kN-m. ` +
      'In STAAD, go to File → Configure → Units and switch to kN-m, then re-sync.',
      400,
    )
  }

  const supabase = createServiceClient()

  // 1. Detect hash mismatch against the most recent sync for this project.
  const { data: lastSync, error: lastErr } = await supabase
    .from('staad_syncs')
    .select('file_hash')
    .eq('project_id', payload.project_id)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastErr) return fail(`staad_syncs lookup: ${lastErr.message}`, 500)

  const mismatchDetected =
    lastSync !== null && lastSync.file_hash !== payload.file_hash

  // 1b. Member-level diff. If the file hash changed, compare the
  // incoming member set to what's already in staad_members and collect
  // the ids whose geometry actually changed (section rename, length
  // delta, node incidence swap). These drive the `geometry_changed`
  // flag on beam/column designs — Object 2 data is never auto-deleted
  // (docs/02-architecture.md § Sync Check On Project Open); it's
  // flagged as unverified so the user can review.
  let mismatchMembers: number[] = []
  if (mismatchDetected) {
    const { data: existingMembers, error: memErr } = await supabase
      .from('staad_members')
      .select('member_id, section_name, length_mm, start_node_id, end_node_id')
      .eq('project_id', payload.project_id)
    if (memErr) return fail(`members diff: ${memErr.message}`, 500)

    const incomingById = new Map(payload.members.map((m) => [m.member_id, m]))
    const changed = new Set<number>()
    for (const prev of existingMembers ?? []) {
      const next = incomingById.get(prev.member_id)
      if (!next) {
        // Member was removed — not a change of an existing design, but
        // anyone referencing it will now have a dangling id.
        changed.add(prev.member_id)
        continue
      }
      if (
        prev.section_name !== next.section_name ||
        Math.abs(prev.length_mm - next.length_mm) > 0.5 ||
        prev.start_node_id !== next.start_node_id ||
        prev.end_node_id !== next.end_node_id
      ) {
        changed.add(prev.member_id)
      }
    }
    mismatchMembers = Array.from(changed).sort((a, b) => a - b)
  }

  // 2. Append a sync row (the header — counts fill in below).
  const { data: syncRow, error: syncErr } = await supabase
    .from('staad_syncs')
    .insert({
      project_id: payload.project_id,
      file_name: payload.file_name,
      file_hash: payload.file_hash,
      unit_system: payload.unit_system,
      status: 'ok',
      node_count: payload.nodes.length,
      member_count: payload.members.length,
      mismatch_detected: mismatchDetected,
      mismatch_members: mismatchMembers,
    })
    .select('id')
    .single()
  if (syncErr || !syncRow) {
    return fail(`staad_syncs insert: ${syncErr?.message ?? 'unknown'}`, 500)
  }

  const projectId = payload.project_id

  // 2b. Flag Object 2 designs that reference any changed member. We do
  // this before the upserts so even if a downstream upsert errors, the
  // flag stays put and the UI surfaces the mismatch correctly.
  if (mismatchMembers.length > 0) {
    const { error: beamFlagErr } = await supabase
      .from('beam_designs')
      .update({ geometry_changed: true, design_status: 'unverified' })
      .eq('project_id', projectId)
      .overlaps('member_ids', mismatchMembers)
    if (beamFlagErr) return fail(`beam flag: ${beamFlagErr.message}`, 500)

    const { error: colFlagErr } = await supabase
      .from('column_designs')
      .update({ geometry_changed: true, design_status: 'unverified' })
      .eq('project_id', projectId)
      .overlaps('member_ids', mismatchMembers)
    if (colFlagErr) return fail(`col flag: ${colFlagErr.message}`, 500)
  }

  // 3. Upserts, in an order that respects the natural reference chain.
  //    Upsert semantics come from the UNIQUE constraints in migration 0001.
  const steps: Array<{ label: string; run: () => Promise<{ error: { message: string } | null }> }> = [
    {
      label: 'staad_nodes',
      run: async () =>
        supabase
          .from('staad_nodes')
          .upsert(
            payload.nodes.map((n) => ({
              project_id: projectId,
              node_id: n.node_id,
              x_mm: n.x_mm,
              y_mm: n.y_mm,
              z_mm: n.z_mm,
              support_type: n.support_type,
            })),
            { onConflict: 'project_id,node_id' },
          ),
    },
    {
      label: 'staad_sections',
      run: async () =>
        supabase
          .from('staad_sections')
          .upsert(
            payload.sections.map((s) => ({
              project_id: projectId,
              section_name: s.section_name,
              section_type: s.section_type,
              b_mm: s.b_mm ?? null,
              h_mm: s.h_mm ?? null,
              area_mm2: s.area_mm2 ?? null,
              i_major_mm4: s.i_major_mm4 ?? null,
              i_minor_mm4: s.i_minor_mm4 ?? null,
            })),
            { onConflict: 'project_id,section_name' },
          ),
    },
    {
      label: 'staad_materials',
      run: async () => {
        if (!payload.materials || payload.materials.length === 0) {
          return { error: null }
        }
        return supabase
          .from('staad_materials')
          .upsert(
            payload.materials.map((m) => ({
              project_id: projectId,
              name: m.name,
              e_mpa: m.e_mpa,
              density_kn_m3: m.density_kn_m3,
              fc_mpa: m.fc_mpa ?? null,
              fy_mpa: m.fy_mpa ?? null,
            })),
            { onConflict: 'project_id,name' },
          )
      },
    },
    {
      label: 'staad_members',
      run: async () =>
        supabase
          .from('staad_members')
          .upsert(
            payload.members.map((m) => ({
              project_id: projectId,
              member_id: m.member_id,
              start_node_id: m.start_node_id,
              end_node_id: m.end_node_id,
              section_name: m.section_name,
              material_name: m.material_name ?? null,
              length_mm: m.length_mm,
              beta_angle_deg: m.beta_angle_deg ?? 0,
              member_type: m.member_type,
            })),
            { onConflict: 'project_id,member_id' },
          ),
    },
    {
      label: 'staad_load_cases',
      run: async () =>
        supabase
          .from('staad_load_cases')
          .upsert(
            payload.load_cases.map((c) => ({
              project_id: projectId,
              case_number: c.case_number,
              title: c.title,
              load_type: c.load_type,
            })),
            { onConflict: 'project_id,case_number' },
          ),
    },
    {
      label: 'staad_combinations',
      run: async () =>
        supabase
          .from('staad_combinations')
          .upsert(
            payload.combinations.map((c) => ({
              project_id: projectId,
              combo_number: c.combo_number,
              title: c.title,
              factors: c.factors,
              source: c.source ?? 'imported',
            })),
            { onConflict: 'project_id,combo_number' },
          ),
    },
    {
      label: 'staad_diagram_points',
      run: async () =>
        supabase
          .from('staad_diagram_points')
          .upsert(
            payload.diagram_points.map((p) => ({
              project_id: projectId,
              member_id: p.member_id,
              combo_number: p.combo_number,
              x_ratio: p.x_ratio,
              x_mm: p.x_mm,
              mz_knm: p.mz_knm,
              vy_kn: p.vy_kn,
              n_kn: p.n_kn,
              my_knm: p.my_knm ?? 0,
              vz_kn: p.vz_kn ?? 0,
            })),
            { onConflict: 'project_id,member_id,combo_number,x_ratio' },
          ),
    },
    {
      label: 'staad_envelope',
      run: async () =>
        supabase
          .from('staad_envelope')
          .upsert(
            payload.envelope.map((e) => ({
              project_id: projectId,
              member_id: e.member_id,
              mpos_max_knm: e.mpos_max_knm,
              mpos_combo: e.mpos_combo ?? null,
              mneg_max_knm: e.mneg_max_knm,
              mneg_combo: e.mneg_combo ?? null,
              vu_max_kn: e.vu_max_kn,
              vu_combo: e.vu_combo ?? null,
              nu_tension_max_kn: e.nu_tension_max_kn ?? 0,
              nu_compression_max_kn: e.nu_compression_max_kn ?? 0,
              mpos_max_minor_knm: e.mpos_max_minor_knm ?? 0,
              mpos_combo_minor: e.mpos_combo_minor ?? null,
              mneg_max_minor_knm: e.mneg_max_minor_knm ?? 0,
              mneg_combo_minor: e.mneg_combo_minor ?? null,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'project_id,member_id' },
          ),
    },
    {
      label: 'staad_reactions',
      run: async () =>
        supabase
          .from('staad_reactions')
          .upsert(
            payload.reactions.map((r) => ({
              project_id: projectId,
              node_id: r.node_id,
              combo_number: r.combo_number,
              rx_kn: r.rx_kn,
              ry_kn: r.ry_kn,
              rz_kn: r.rz_kn,
              mx_knm: r.mx_knm,
              my_knm: r.my_knm,
              mz_knm: r.mz_knm,
            })),
            { onConflict: 'project_id,node_id,combo_number' },
          ),
    },
  ]

  for (const step of steps) {
    const { error } = await step.run()
    if (error) {
      // Mark the sync row as errored so the UI can surface it.
      await supabase
        .from('staad_syncs')
        .update({ status: 'error' })
        .eq('id', syncRow.id)
      return fail(`${step.label}: ${error.message}`, 500)
    }
  }

  return ok({
    sync_id: syncRow.id,
    mismatch_detected: mismatchDetected,
    counts: {
      nodes: payload.nodes.length,
      members: payload.members.length,
      sections: payload.sections.length,
      materials: payload.materials?.length ?? 0,
      load_cases: payload.load_cases.length,
      combinations: payload.combinations.length,
      diagram_points: payload.diagram_points.length,
      envelope: payload.envelope.length,
      reactions: payload.reactions.length,
    },
  })
}
