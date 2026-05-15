/**
 * Project read helpers. Server-only.
 *
 * These are plain async functions today; once real caching is desired they
 * are the natural place to apply Next.js 16's `use cache` directive with a
 * tag like `projects` so invalidation stays in one place
 * (see docs/09-pages.md).
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type ProjectRow = Database['public']['Tables']['projects']['Row']

export type DashboardProject = ProjectRow & {
  last_sync: {
    synced_at: string
    file_name: string
    file_hash: string
    mismatch_detected: boolean
  } | null
}

export async function listProjects(): Promise<DashboardProject[]> {
  const supabase = await createClient()

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listProjects: ${error.message}`)
  if (!projects || projects.length === 0) return []

  // Fetch the latest sync per project in one go. We over-fetch, then keep
  // only the most recent row per project_id in-memory — acceptable at this
  // cardinality (personal app, handful of projects).
  const { data: syncs, error: syncErr } = await supabase
    .from('staad_syncs')
    .select('project_id, synced_at, file_name, file_hash, mismatch_detected')
    .order('synced_at', { ascending: false })
  if (syncErr) throw new Error(`listProjects syncs: ${syncErr.message}`)

  const latestByProject = new Map<string, DashboardProject['last_sync']>()
  for (const s of syncs ?? []) {
    if (!latestByProject.has(s.project_id)) {
      latestByProject.set(s.project_id, {
        synced_at: s.synced_at,
        file_name: s.file_name,
        file_hash: s.file_hash,
        mismatch_detected: s.mismatch_detected,
      })
    }
  }

  return projects.map((p) => ({
    ...p,
    last_sync: latestByProject.get(p.id) ?? null,
  }))
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getProject: ${error.message}`)
  return data
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

export type ElementCounts = {
  total: number
  pass: number
  fail: number
  pending: number
}

export type DashboardStats = {
  projects: {
    active: number
    completed: number
  }
  beams: ElementCounts
  columns: ElementCounts
  slabs: ElementCounts
  footings: ElementCounts
  reports_count: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()

  const [projectsResp, beamsResp, columnsResp, slabsResp, footingsResp, reportsResp] =
    await Promise.all([
      supabase.from('projects').select('id').is('archived_at', null),
      supabase.from('beam_designs').select('design_status'),
      supabase.from('column_designs').select('design_status'),
      supabase.from('slab_designs').select('design_status'),
      supabase.from('footing_designs').select('design_status'),
      supabase.from('design_reports').select('id'),
    ])

  const toCounts = (data: { design_status: string }[] | null): ElementCounts => {
    const rows = data ?? []
    return {
      total: rows.length,
      pass: rows.filter((r) => r.design_status === 'pass').length,
      fail: rows.filter((r) => r.design_status === 'fail').length,
      pending: rows.filter(
        (r) =>
          r.design_status === 'pending' ||
          r.design_status === 'unverified',
      ).length,
    }
  }

  const projects = (projectsResp.data ?? []).length
  // "Completed" = projects where every element design is `pass`.
  // Costly to compute precisely across all tables, so we approximate
  // with "at least one pass and zero fails in that project". Rolled up
  // per-project accounting is a later refinement.
  const completed = 0 // filled in via a dedicated view later

  return {
    projects: {
      active: projects,
      completed,
    },
    beams: toCounts(beamsResp.data ?? null),
    columns: toCounts(columnsResp.data ?? null),
    slabs: toCounts(slabsResp.data ?? null),
    footings: toCounts(footingsResp.data ?? null),
    reports_count: (reportsResp.data ?? []).length,
  }
}

// ---------------------------------------------------------------------------
// Recent Activity feed
// ---------------------------------------------------------------------------

export type ActivityEvent = {
  at: string
  project_id: string
  project_name: string
  kind:
    | 'sync'
    | 'beam_designed'
    | 'column_designed'
    | 'slab_designed'
    | 'footing_designed'
    | 'report_generated'
  element_label: string | null
  status: 'pass' | 'fail' | 'pending' | 'unverified' | 'mismatch' | 'ok'
}

/**
 * Merge the last-designed timestamps across every design table + the
 * staad_syncs log + design_reports into a single reverse-chronological
 * feed. We cap per-source so a project with thousands of syncs
 * doesn't dominate the output.
 */
export async function listRecentActivity(limit = 25): Promise<ActivityEvent[]> {
  const supabase = await createClient()

  const [projectsResp, syncsResp, beamsResp, colsResp, slabsResp, footsResp, reportsResp] =
    await Promise.all([
      supabase.from('projects').select('id, name').is('archived_at', null),
      supabase
        .from('staad_syncs')
        .select('project_id, synced_at, file_name, mismatch_detected, status')
        .order('synced_at', { ascending: false })
        .limit(limit),
      supabase
        .from('beam_designs')
        .select('project_id, label, last_designed_at, design_status')
        .not('last_designed_at', 'is', null)
        .order('last_designed_at', { ascending: false })
        .limit(limit),
      supabase
        .from('column_designs')
        .select('project_id, label, last_designed_at, design_status')
        .not('last_designed_at', 'is', null)
        .order('last_designed_at', { ascending: false })
        .limit(limit),
      supabase
        .from('slab_designs')
        .select('project_id, label, last_designed_at, design_status')
        .not('last_designed_at', 'is', null)
        .order('last_designed_at', { ascending: false })
        .limit(limit),
      supabase
        .from('footing_designs')
        .select('project_id, label, last_designed_at, design_status')
        .not('last_designed_at', 'is', null)
        .order('last_designed_at', { ascending: false })
        .limit(limit),
      supabase
        .from('design_reports')
        .select('project_id, title, generated_at, is_in_sync')
        .order('generated_at', { ascending: false })
        .limit(limit),
    ])

  const nameById = new Map(
    (projectsResp.data ?? []).map((p) => [p.id, p.name]),
  )

  const events: ActivityEvent[] = []

  for (const s of syncsResp.data ?? []) {
    events.push({
      at: s.synced_at,
      project_id: s.project_id,
      project_name: nameById.get(s.project_id) ?? '—',
      kind: 'sync',
      element_label: s.file_name,
      status: s.mismatch_detected ? 'mismatch' : (s.status === 'error' ? 'fail' : 'ok'),
    })
  }

  const pushDesigns = (
    rows: {
      project_id: string
      label: string
      last_designed_at: string | null
      design_status: string
    }[] | null,
    kind: ActivityEvent['kind'],
  ) => {
    for (const r of rows ?? []) {
      if (!r.last_designed_at) continue
      events.push({
        at: r.last_designed_at,
        project_id: r.project_id,
        project_name: nameById.get(r.project_id) ?? '—',
        kind,
        element_label: r.label,
        status: r.design_status as ActivityEvent['status'],
      })
    }
  }
  pushDesigns(beamsResp.data ?? null, 'beam_designed')
  pushDesigns(colsResp.data ?? null, 'column_designed')
  pushDesigns(slabsResp.data ?? null, 'slab_designed')
  pushDesigns(footsResp.data ?? null, 'footing_designed')

  for (const r of reportsResp.data ?? []) {
    events.push({
      at: r.generated_at,
      project_id: r.project_id,
      project_name: nameById.get(r.project_id) ?? '—',
      kind: 'report_generated',
      element_label: r.title,
      status: r.is_in_sync ? 'ok' : 'unverified',
    })
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return events.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Per-project element counts for the dashboard project cards
// ---------------------------------------------------------------------------

export type ProjectCardStats = ProjectRow & {
  last_sync: DashboardProject['last_sync']
  beams: ElementCounts
  columns: ElementCounts
  slabs: ElementCounts
  footings: ElementCounts
}

export async function listProjectCards(): Promise<ProjectCardStats[]> {
  const base = await listProjects()
  if (base.length === 0) return []

  const supabase = await createClient()
  const [beamsResp, colsResp, slabsResp, footsResp] = await Promise.all([
    supabase.from('beam_designs').select('project_id, design_status'),
    supabase.from('column_designs').select('project_id, design_status'),
    supabase.from('slab_designs').select('project_id, design_status'),
    supabase.from('footing_designs').select('project_id, design_status'),
  ])

  const rollup = (
    rows: { project_id: string; design_status: string }[] | null,
  ): Map<string, ElementCounts> => {
    const map = new Map<string, ElementCounts>()
    for (const r of rows ?? []) {
      const c = map.get(r.project_id) ?? { total: 0, pass: 0, fail: 0, pending: 0 }
      c.total += 1
      if (r.design_status === 'pass') c.pass += 1
      else if (r.design_status === 'fail') c.fail += 1
      else c.pending += 1
      map.set(r.project_id, c)
    }
    return map
  }

  const zero: ElementCounts = { total: 0, pass: 0, fail: 0, pending: 0 }
  const beamMap = rollup(beamsResp.data ?? null)
  const colMap = rollup(colsResp.data ?? null)
  const slabMap = rollup(slabsResp.data ?? null)
  const footMap = rollup(footsResp.data ?? null)

  return base.map((p) => ({
    ...p,
    beams: beamMap.get(p.id) ?? zero,
    columns: colMap.get(p.id) ?? zero,
    slabs: slabMap.get(p.id) ?? zero,
    footings: footMap.get(p.id) ?? zero,
  }))
}

// ---------------------------------------------------------------------------
// STAAD version rollup for the project page
// ---------------------------------------------------------------------------

export type StaadVersionRow = {
  kind: 'active' | 'archived' | 'mismatch'
  project_id: string
  archive_project_id: string | null
  file_name: string
  file_hash: string
  first_synced_at: string | null
  last_synced_at: string | null
  sync_count: number
}

export type StaadVersions = {
  rows: StaadVersionRow[]
  hasMismatch: boolean
  mismatchIncoming: { file_name: string; file_hash: string } | null
}

export async function listStaadVersions(projectId: string): Promise<StaadVersions> {
  const supabase = await createClient()

  const project = await getProject(projectId)
  if (!project) return { rows: [], hasMismatch: false, mismatchIncoming: null }

  // Pull all syncs for the live project + every archive that originated
  // from it. Aggregate per (project_id, file_hash) in-memory.
  const { data: archives, error: archErr } = await supabase
    .from('projects')
    .select(
      'id, name, archived_at, active_staad_hash, active_staad_file_name',
    )
    .eq('archived_from_project_id', projectId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (archErr) throw new Error(`listStaadVersions archives: ${archErr.message}`)

  const projectIds = [projectId, ...(archives ?? []).map((a) => a.id)]

  const { data: syncs, error: syncErr } = await supabase
    .from('staad_syncs')
    .select('project_id, file_hash, file_name, status, synced_at')
    .in('project_id', projectIds)
    .order('synced_at', { ascending: false })
  if (syncErr) throw new Error(`listStaadVersions syncs: ${syncErr.message}`)

  // Group OK-status syncs by (project_id, file_hash) for the version rows.
  type Agg = {
    file_name: string
    file_hash: string
    first: string
    last: string
    count: number
  }
  const okAgg = new Map<string, Agg>()
  for (const s of syncs ?? []) {
    if (s.status !== 'ok') continue
    const k = `${s.project_id}::${s.file_hash}`
    const a = okAgg.get(k)
    if (!a) {
      okAgg.set(k, {
        file_name: s.file_name,
        file_hash: s.file_hash,
        first: s.synced_at,
        last: s.synced_at,
        count: 1,
      })
    } else {
      a.count += 1
      if (s.synced_at < a.first) a.first = s.synced_at
      if (s.synced_at > a.last) a.last = s.synced_at
    }
  }

  const rows: StaadVersionRow[] = []

  // Active row (live project's current pinned hash).
  if (project.active_staad_hash) {
    const k = `${projectId}::${project.active_staad_hash}`
    const a = okAgg.get(k)
    rows.push({
      kind: 'active',
      project_id: projectId,
      archive_project_id: null,
      file_name: project.active_staad_file_name ?? a?.file_name ?? '—',
      file_hash: project.active_staad_hash,
      first_synced_at: a?.first ?? null,
      last_synced_at: a?.last ?? null,
      sync_count: a?.count ?? 0,
    })
  }

  // Archived rows.
  for (const ar of archives ?? []) {
    if (!ar.active_staad_hash) continue
    const k = `${ar.id}::${ar.active_staad_hash}`
    const a = okAgg.get(k)
    rows.push({
      kind: 'archived',
      project_id: projectId,
      archive_project_id: ar.id,
      file_name: ar.active_staad_file_name ?? a?.file_name ?? '—',
      file_hash: ar.active_staad_hash,
      first_synced_at: a?.first ?? null,
      last_synced_at: a?.last ?? null,
      sync_count: a?.count ?? 0,
    })
  }

  // Mismatch row — most recent 'mismatch' status on the LIVE project that
  // is still distinct from the active hash.
  let mismatchIncoming: StaadVersions['mismatchIncoming'] = null
  const latestMismatch = (syncs ?? []).find(
    (s) =>
      s.project_id === projectId &&
      s.status === 'mismatch' &&
      s.file_hash !== project.active_staad_hash,
  )
  if (latestMismatch) {
    mismatchIncoming = {
      file_name: latestMismatch.file_name,
      file_hash: latestMismatch.file_hash,
    }
    rows.unshift({
      kind: 'mismatch',
      project_id: projectId,
      archive_project_id: null,
      file_name: latestMismatch.file_name,
      file_hash: latestMismatch.file_hash,
      first_synced_at: null,
      last_synced_at: latestMismatch.synced_at,
      sync_count: 0,
    })
  }

  return { rows, hasMismatch: !!mismatchIncoming, mismatchIncoming }
}

