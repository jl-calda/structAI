'use server'

import { revalidatePath } from 'next/cache'

import { generateCombinations } from '@/lib/loads/generator'
import { recomputeEnvelope } from '@/lib/loads/envelope'
import { pushCombinations, requestResync } from '@/lib/staad/bridge-client'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { LoadTemplateEntry } from '@/lib/supabase/types'

export type GenerateCombinationsOutcome =
  | { ok: true; written: number; bridge: 'pushed' | 'offline' | 'error'; warnings: string[] }
  | { ok: false; error: string }

/**
 * Generate app-managed combinations for a project from a system template,
 * persist them to staad_combinations, recompute the envelope from
 * diagram_points, and best-effort push the combinations back to STAAD
 * via the bridge.
 */
export async function generateCombinationsAction(args: {
  projectId: string
  templateId: string
}): Promise<GenerateCombinationsOutcome> {
  const { projectId, templateId } = args

  const supabase = await createClient()

  // Load the template and current STAAD load cases in parallel.
  const [templateResp, casesResp] = await Promise.all([
    supabase
      .from('load_templates')
      .select('name, combinations')
      .eq('id', templateId)
      .maybeSingle(),
    supabase
      .from('staad_load_cases')
      .select('case_number, title, load_type')
      .eq('project_id', projectId)
      .order('case_number', { ascending: true }),
  ])

  if (templateResp.error)
    return { ok: false, error: `template: ${templateResp.error.message}` }
  if (!templateResp.data)
    return { ok: false, error: 'template not found' }
  if (casesResp.error)
    return { ok: false, error: `load_cases: ${casesResp.error.message}` }

  const templateEntries = templateResp.data.combinations as LoadTemplateEntry[]
  const cases = casesResp.data ?? []

  // Start numbering beyond any existing combo for this project.
  const { data: maxCombo } = await supabase
    .from('staad_combinations')
    .select('combo_number')
    .eq('project_id', projectId)
    .order('combo_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const startCombo = Math.max(101, (maxCombo?.combo_number ?? 100) + 1)

  const { combinations, warnings } = generateCombinations(
    templateEntries,
    cases,
    startCombo,
  )

  if (combinations.length === 0) {
    return {
      ok: false,
      error:
        warnings[0] ??
        'No combinations could be generated — STAAD load cases may be missing.',
    }
  }

  // Write via service client — combos bypass anon and overwrite existing
  // app_generated rows on the unique (project_id, combo_number) key.
  const service = createServiceClient()
  const { error: writeErr } = await service
    .from('staad_combinations')
    .upsert(
      combinations.map((c) => ({
        project_id: projectId,
        combo_number: c.combo_number,
        title: c.title,
        factors: c.factors,
        source: c.source,
      })),
      { onConflict: 'project_id,combo_number' },
    )
  if (writeErr) return { ok: false, error: `write combos: ${writeErr.message}` }

  // Refresh envelope so the Load Combos summary and Overview stats are
  // consistent immediately after generation.
  try {
    await recomputeEnvelope(projectId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `envelope: ${message}` }
  }

  // Fire-and-forget bridge push. Offline ≠ failure.
  let bridge: 'pushed' | 'offline' | 'error' = 'offline'
  const bridgeOutcome = await pushCombinations({
    project_id: projectId,
    combinations: combinations.map((c) => ({
      combo_number: c.combo_number,
      title: c.title,
      factors: c.factors,
    })),
  })
  if (bridgeOutcome.ok) bridge = 'pushed'
  else if (/abort|ECONNREFUSED|fetch failed/i.test(bridgeOutcome.error))
    bridge = 'offline'
  else bridge = 'error'

  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/combinations`)
  revalidatePath(`/projects/${projectId}/setup`)

  return { ok: true, written: combinations.length, bridge, warnings }
}

export type RecomputeEnvelopeOutcome =
  | { ok: true; members: number }
  | { ok: false; error: string }

export async function recomputeEnvelopeAction(
  projectId: string,
): Promise<RecomputeEnvelopeOutcome> {
  try {
    const res = await recomputeEnvelope(projectId)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/combinations`)
    return { ok: true, members: res.members }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export type RequestResyncOutcome =
  | { ok: true }
  | { ok: false; error: string; offline: boolean }

export async function requestResyncAction(
  projectId: string,
): Promise<RequestResyncOutcome> {
  const result = await requestResync(projectId)
  if (result.ok) {
    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/setup`)
    return { ok: true }
  }
  const offline = /abort|ECONNREFUSED|fetch failed/i.test(result.error)
  return { ok: false, error: result.error, offline }
}
