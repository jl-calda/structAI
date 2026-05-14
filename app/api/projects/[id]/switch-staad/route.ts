/**
 * POST /api/projects/[id]/switch-staad
 *
 * "Change STAAD" — clones the live project into a frozen archive and
 * resets the live project's staad_* cache so the next bridge sync can
 * populate it from the new file. Element designs are preserved on the
 * live project but flagged as unverified (member_ids may now point at
 * stale STAAD numbering).
 *
 * Body: { incoming_file_hash: string, incoming_file_name: string } —
 *   echoed back from the 409 staad_mismatch response the bridge just
 *   surfaced, so we know exactly what file the user is adopting.
 *
 * Returns: { archive_id, archive_name }
 */
import { NextRequest } from 'next/server'

import { fail, ok } from '@/lib/api/response'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  incoming_file_hash?: unknown
  incoming_file_name?: unknown
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail('Invalid JSON body', 400)
  }

  if (
    typeof body.incoming_file_hash !== 'string' ||
    !body.incoming_file_hash ||
    typeof body.incoming_file_name !== 'string' ||
    !body.incoming_file_name
  ) {
    return fail('incoming_file_hash and incoming_file_name are required', 400)
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('switch_project_staad', {
    p_project_id: projectId,
    p_incoming_hash: body.incoming_file_hash,
    p_incoming_file: body.incoming_file_name,
  })
  if (error) return fail(`switch_project_staad: ${error.message}`, 500)
  const row = data?.[0]
  if (!row) return fail('switch_project_staad returned no rows', 500)

  return ok({ archive_id: row.archive_id, archive_name: row.archive_name })
}
