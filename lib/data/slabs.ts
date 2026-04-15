import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type SlabDesignRow = Database['public']['Tables']['slab_designs']['Row']
export type SlabReinforcementRow =
  Database['public']['Tables']['slab_reinforcement']['Row']
export type SlabCheckRow = Database['public']['Tables']['slab_checks']['Row']

export async function listSlabDesigns(projectId: string): Promise<SlabDesignRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('slab_designs')
    .select('*')
    .eq('project_id', projectId)
    .order('label', { ascending: true })
  if (error) throw new Error(`listSlabDesigns: ${error.message}`)
  return data ?? []
}

export async function getSlabDesign(id: string): Promise<{
  design: SlabDesignRow
  rebar: SlabReinforcementRow | null
  checks: SlabCheckRow | null
} | null> {
  const supabase = await createClient()
  const [design, rebar, checks] = await Promise.all([
    supabase.from('slab_designs').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('slab_reinforcement')
      .select('*')
      .eq('slab_design_id', id)
      .maybeSingle(),
    supabase
      .from('slab_checks')
      .select('*')
      .eq('slab_design_id', id)
      .maybeSingle(),
  ])
  if (design.error) throw new Error(`getSlabDesign: ${design.error.message}`)
  if (!design.data) return null
  return {
    design: design.data,
    rebar: rebar.data ?? null,
    checks: checks.data ?? null,
  }
}
