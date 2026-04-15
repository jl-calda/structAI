/**
 * Combination / envelope / template read helpers. Server-only.
 * `summariseEnvelope` is a pure function and is safe to import into client
 * components if needed, but today it's only consumed on the server.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { CodeStandard, Database } from '@/lib/supabase/types'

export type LoadCaseRow =
  Database['public']['Tables']['staad_load_cases']['Row']
export type CombinationRow =
  Database['public']['Tables']['staad_combinations']['Row']
export type EnvelopeRow =
  Database['public']['Tables']['staad_envelope']['Row']
export type LoadTemplateRow =
  Database['public']['Tables']['load_templates']['Row']

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

export async function listCombinations(
  projectId: string,
): Promise<CombinationRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_combinations')
    .select('*')
    .eq('project_id', projectId)
    .order('combo_number', { ascending: true })
  if (error) throw new Error(`listCombinations: ${error.message}`)
  return data ?? []
}

export async function listEnvelope(
  projectId: string,
): Promise<EnvelopeRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staad_envelope')
    .select('*')
    .eq('project_id', projectId)
    .order('member_id', { ascending: true })
  if (error) throw new Error(`listEnvelope: ${error.message}`)
  return data ?? []
}

export async function listSystemTemplates(
  codeStandard: CodeStandard,
): Promise<LoadTemplateRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('load_templates')
    .select('*')
    .eq('is_system', true)
    .eq('code_standard', codeStandard)
    .order('name', { ascending: true })
  if (error) throw new Error(`listSystemTemplates: ${error.message}`)
  return data ?? []
}

/**
 * Envelope summary: single governing triple across all members.
 * Used by the Load Combos page's stat row.
 */
export function summariseEnvelope(envelope: EnvelopeRow[]) {
  let mpos = 0
  let mposMember: number | null = null
  let mposCombo: number | null = null
  let mneg = 0
  let mnegMember: number | null = null
  let mnegCombo: number | null = null
  let vu = 0
  let vuMember: number | null = null
  let vuCombo: number | null = null

  for (const e of envelope) {
    if (e.mpos_max_knm > mpos) {
      mpos = e.mpos_max_knm
      mposMember = e.member_id
      mposCombo = e.mpos_combo
    }
    if (e.mneg_max_knm > mneg) {
      mneg = e.mneg_max_knm
      mnegMember = e.member_id
      mnegCombo = e.mneg_combo
    }
    if (e.vu_max_kn > vu) {
      vu = e.vu_max_kn
      vuMember = e.member_id
      vuCombo = e.vu_combo
    }
  }

  return {
    mpos: { value: mpos, member: mposMember, combo: mposCombo },
    mneg: { value: mneg, member: mnegMember, combo: mnegCombo },
    vu:   { value: vu,   member: vuMember,   combo: vuCombo   },
  }
}
