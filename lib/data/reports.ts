import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type ReportRow = Database['public']['Tables']['design_reports']['Row']

export async function listReports(projectId: string): Promise<ReportRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('design_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('generated_at', { ascending: false })
  if (error) throw new Error(`listReports: ${error.message}`)
  return data ?? []
}
