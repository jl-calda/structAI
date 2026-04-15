import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type FootingDesignRow =
  Database['public']['Tables']['footing_designs']['Row']
export type FootingCheckRow =
  Database['public']['Tables']['footing_checks']['Row']

export async function listFootingDesigns(
  projectId: string,
): Promise<FootingDesignRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('footing_designs')
    .select('*')
    .eq('project_id', projectId)
    .order('label', { ascending: true })
  if (error) throw new Error(`listFootingDesigns: ${error.message}`)
  return data ?? []
}

export async function getFootingDesign(id: string): Promise<{
  design: FootingDesignRow
  checks: FootingCheckRow | null
} | null> {
  const supabase = await createClient()
  const [design, checks] = await Promise.all([
    supabase.from('footing_designs').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('footing_checks')
      .select('*')
      .eq('footing_design_id', id)
      .maybeSingle(),
  ])
  if (design.error) throw new Error(`getFootingDesign: ${design.error.message}`)
  if (!design.data) return null
  return { design: design.data, checks: checks.data ?? null }
}
