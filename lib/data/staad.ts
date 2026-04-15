/**
 * STAAD-side read helpers (Object 1).
 */
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type SyncRow = Database['public']['Tables']['staad_syncs']['Row']
export type MemberRow = Database['public']['Tables']['staad_members']['Row']
export type NodeRow = Database['public']['Tables']['staad_nodes']['Row']

export type SyncStatusKind = 'green' | 'amber' | 'red' | 'none'

export type LatestSync = {
  row: SyncRow
  status: SyncStatusKind
} | null

/** Fetch the most recent sync for a project (null if never synced). */
export async function getLatestSync(projectId: string): Promise<LatestSync> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_syncs')
    .select('*')
    .eq('project_id', projectId)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestSync: ${error.message}`)
  if (!data) return null

  const status: SyncStatusKind = data.mismatch_detected
    ? 'red'
    : data.status === 'error'
      ? 'red'
      : 'green'

  return { row: data, status }
}

export async function listMembers(projectId: string): Promise<MemberRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_members')
    .select('*')
    .eq('project_id', projectId)
    .order('member_id', { ascending: true })
  if (error) throw new Error(`listMembers: ${error.message}`)
  return data ?? []
}

export async function listNodes(projectId: string): Promise<NodeRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_nodes')
    .select('*')
    .eq('project_id', projectId)
    .order('node_id', { ascending: true })
  if (error) throw new Error(`listNodes: ${error.message}`)
  return data ?? []
}

/** Short hash rendering — first 8 chars, uppercase. */
export function shortHash(hash: string): string {
  return hash.slice(0, 8).toUpperCase()
}
