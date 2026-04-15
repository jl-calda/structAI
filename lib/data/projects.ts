/**
 * Project read helpers (server-side).
 *
 * These are plain async functions today; once real caching is desired they
 * are the natural place to apply Next.js 16's `use cache` directive with a
 * tag like `projects` so invalidation stays in one place
 * (see docs/09-pages.md).
 */
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

