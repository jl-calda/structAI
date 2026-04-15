/**
 * Column read helpers. Server-only.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type ColumnDesignRow =
  Database['public']['Tables']['column_designs']['Row']
export type ColumnReinforcementRow =
  Database['public']['Tables']['column_reinforcement']['Row']
export type ColumnCheckRow =
  Database['public']['Tables']['column_checks']['Row']

export async function listColumnDesigns(
  projectId: string,
): Promise<ColumnDesignRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('column_designs')
    .select('*')
    .eq('project_id', projectId)
    .order('label', { ascending: true })
  if (error) throw new Error(`listColumnDesigns: ${error.message}`)
  return data ?? []
}

export async function getColumnDesign(id: string): Promise<{
  design: ColumnDesignRow
  rebar: ColumnReinforcementRow | null
  checks: ColumnCheckRow | null
} | null> {
  const supabase = await createClient()
  const [design, rebar, checks] = await Promise.all([
    supabase.from('column_designs').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('column_reinforcement')
      .select('*')
      .eq('column_design_id', id)
      .maybeSingle(),
    supabase
      .from('column_checks')
      .select('*')
      .eq('column_design_id', id)
      .maybeSingle(),
  ])
  if (design.error) throw new Error(`getColumnDesign: ${design.error.message}`)
  if (!design.data) return null
  return {
    design: design.data,
    rebar: rebar.data ?? null,
    checks: checks.data ?? null,
  }
}
