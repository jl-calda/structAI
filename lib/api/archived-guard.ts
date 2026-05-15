/**
 * Archived-project write guard for mutation endpoints.
 *
 * Archived projects are read-only snapshots — any save/recheck/design
 * mutation that targets one should 403 immediately.
 */
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { fail } from '@/lib/api/response'
import type { Database } from '@/lib/supabase/types'

export async function ensureProjectWritable(
  supabase: SupabaseClient<Database>,
  projectId: string,
) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, archived_at')
    .eq('id', projectId)
    .maybeSingle()
  if (error) return { ok: false as const, response: fail(`project: ${error.message}`, 500) }
  if (!data) return { ok: false as const, response: fail('project not found', 404) }
  if (data.archived_at) {
    return {
      ok: false as const,
      response: fail('Project is archived and read-only.', 403),
    }
  }
  return { ok: true as const }
}

/**
 * Plain assertion variant for server actions (no NextResponse). Returns
 * the same { ok: true } | { ok: false; error } envelope the actions use.
 */
export async function assertProjectWritable(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('projects')
    .select('archived_at')
    .eq('id', projectId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Project not found.' }
  if (data.archived_at) return { ok: false, error: 'Project is archived and read-only.' }
  return { ok: true }
}
