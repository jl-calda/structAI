/**
 * STAAD-side read helpers (Object 1). Server-only.
 * Pure display helpers live in `lib/format.ts`.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type SyncRow = Database['public']['Tables']['staad_syncs']['Row']
export type MemberRow = Database['public']['Tables']['staad_members']['Row']
export type NodeRow = Database['public']['Tables']['staad_nodes']['Row']
export type SectionRow = Database['public']['Tables']['staad_sections']['Row']
export type MaterialRow = Database['public']['Tables']['staad_materials']['Row']
export type LoadCaseRow = Database['public']['Tables']['staad_load_cases']['Row']
export type CombinationRow = Database['public']['Tables']['staad_combinations']['Row']
export type EnvelopeRow = Database['public']['Tables']['staad_envelope']['Row']
export type ReactionRow = Database['public']['Tables']['staad_reactions']['Row']
export type DiagramPointRow = Database['public']['Tables']['staad_diagram_points']['Row']
export type DisplacementRow = Database['public']['Tables']['staad_displacements']['Row']

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

export async function listSections(projectId: string): Promise<SectionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_sections')
    .select('*')
    .eq('project_id', projectId)
    .order('section_name', { ascending: true })
  if (error) throw new Error(`listSections: ${error.message}`)
  return data ?? []
}

export async function listMaterials(projectId: string): Promise<MaterialRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_materials')
    .select('*')
    .eq('project_id', projectId)
    .order('name', { ascending: true })
  if (error) throw new Error(`listMaterials: ${error.message}`)
  return data ?? []
}

export async function listLoadCases(projectId: string): Promise<LoadCaseRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_load_cases')
    .select('*')
    .eq('project_id', projectId)
    .order('case_number', { ascending: true })
  if (error) throw new Error(`listLoadCases: ${error.message}`)
  return data ?? []
}

export async function listCombinations(projectId: string): Promise<CombinationRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_combinations')
    .select('*')
    .eq('project_id', projectId)
    .order('combo_number', { ascending: true })
  if (error) throw new Error(`listCombinations: ${error.message}`)
  return data ?? []
}

export async function listEnvelope(projectId: string): Promise<EnvelopeRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_envelope')
    .select('*')
    .eq('project_id', projectId)
    .order('member_id', { ascending: true })
  if (error) throw new Error(`listEnvelope: ${error.message}`)
  return data ?? []
}

export async function listReactions(projectId: string): Promise<ReactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_reactions')
    .select('*')
    .eq('project_id', projectId)
    .order('node_id', { ascending: true })
    .order('combo_number', { ascending: true })
  if (error) throw new Error(`listReactions: ${error.message}`)
  return data ?? []
}

export async function listDisplacements(projectId: string): Promise<DisplacementRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_displacements')
    .select('*')
    .eq('project_id', projectId)
    .order('node_id', { ascending: true })
    .order('combo_number', { ascending: true })
  if (error) throw new Error(`listDisplacements: ${error.message}`)
  return data ?? []
}

/** Section forces — caps at 5000 rows (large table). */
export async function listDiagramPoints(
  projectId: string,
  limit = 5000,
): Promise<DiagramPointRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_diagram_points')
    .select('*')
    .eq('project_id', projectId)
    .order('member_id', { ascending: true })
    .order('combo_number', { ascending: true })
    .order('x_ratio', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`listDiagramPoints: ${error.message}`)
  return data ?? []
}

