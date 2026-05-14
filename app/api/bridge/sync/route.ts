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
import { NextRequest, NextResponse } from 'next/server'

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

  let unitWarning: string | null = null
  if (payload.unit_system !== 'kN-m') {
    unitWarning = `STAAD is using "${payload.unit_system}" units. StructAI expects kN-m. `
      + 'Values may be incorrect — coordinates are converted assuming metres. '
      + 'For reliable results, switch STAAD to kN and Meter.'
  }

  const supabase = createServiceClient()

  // 0. Load the project's identity. Archived projects reject all syncs;
  //    live projects with a pinned active_staad_hash reject syncs from a
  //    different STAAD file (the user has to confirm "Change STAAD" first).
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, archived_at, active_staad_hash, active_staad_file_name')
    .eq('id', payload.project_id)
    .maybeSingle()
  if (projErr) return fail(`projects lookup: ${projErr.message}`, 500)
  if (!project) return fail('Project not found', 404)
  if (project.archived_at) {
    return NextResponse.json(
      { ok: false, error: 'project_archived' },
      { status: 409 },
    )
  }

  if (
    project.active_staad_hash &&
    project.active_staad_hash !== payload.file_hash
  ) {
    // Persist a mismatch row so the UI can show "STAAD X is open in the
    // bridge but doesn't match" without a side-channel.
    await supabase.from('staad_syncs').insert({
      project_id: payload.project_id,
      file_name: payload.file_name,
      file_hash: payload.file_hash,
      unit_system: payload.unit_system,
      status: 'mismatch',
      node_count: 0,
      member_count: 0,
      mismatch_detected: true,
      mismatch_members: [],
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'staad_mismatch',
        active: {
          file_name: project.active_staad_file_name,
          file_hash: project.active_staad_hash,
        },
        incoming: {
          file_name: payload.file_name,
          file_hash: payload.file_hash,
        },
      },
      { status: 409 },
    )
  }

  // 1. Detect hash mismatch against the most recent successful sync for
  //    this project. (Only 'ok' rows count — 'mismatch' rows describe
  //    rejected attempts and shouldn't trigger the geometry-change flag.)
  const { data: lastSync, error: lastErr } = await supabase
    .from('staad_syncs')
    .select('file_hash')
    .eq('project_id', payload.project_id)
    .eq('status', 'ok')
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

  // 2a. First-sync pin. Once active_staad_hash is set, the guard above
  //     enforces it on every subsequent sync.
  if (!project.active_staad_hash) {
    const { error: pinErr } = await supabase
      .from('projects')
      .update({
        active_staad_hash: payload.file_hash,
        active_staad_file_name: payload.file_name,
      })
      .eq('id', projectId)
    if (pinErr) return fail(`pin staad: ${pinErr.message}`, 500)
  }

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
              release_start: m.release_start ?? null,
              release_end: m.release_end ?? null,
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
    {
      label: 'staad_displacements',
      run: async () => {
        if (!payload.displacements || payload.displacements.length === 0) {
          return { error: null }
        }
        return supabase
          .from('staad_displacements')
          .upsert(
            payload.displacements.map((d) => ({
              project_id: projectId,
              node_id: d.node_id,
              combo_number: d.combo_number,
              dx_mm: d.dx_mm,
              dy_mm: d.dy_mm,
              dz_mm: d.dz_mm,
              rx_rad: d.rx_rad,
              ry_rad: d.ry_rad,
              rz_rad: d.rz_rad,
            })),
            { onConflict: 'project_id,node_id,combo_number' },
          )
      },
    },
    {
      label: 'staad_end_forces',
      run: async () => {
        if (!payload.end_forces || payload.end_forces.length === 0) {
          return { error: null }
        }
        return supabase
          .from('staad_end_forces')
          .upsert(
            payload.end_forces.map((f) => ({
              project_id: projectId,
              member_id: f.member_id,
              end_index: f.end_index,
              combo_number: f.combo_number,
              fx_kn: f.fx_kn,
              fy_kn: f.fy_kn,
              fz_kn: f.fz_kn,
              mx_knm: f.mx_knm,
              my_knm: f.my_knm,
              mz_knm: f.mz_knm,
            })),
            { onConflict: 'project_id,member_id,end_index,combo_number' },
          )
      },
    },
    {
      label: 'staad_deflections',
      run: async () => {
        if (!payload.deflections || payload.deflections.length === 0) {
          return { error: null }
        }
        return supabase
          .from('staad_deflections')
          .upsert(
            payload.deflections.map((d) => ({
              project_id: projectId,
              member_id: d.member_id,
              combo_number: d.combo_number,
              x_ratio: d.x_ratio,
              dy_mm: d.dy_mm,
              dz_mm: d.dz_mm,
            })),
            { onConflict: 'project_id,member_id,combo_number,x_ratio' },
          )
      },
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
    unit_system: payload.unit_system,
    unit_warning: unitWarning,
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
