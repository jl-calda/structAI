'use server'

import { revalidatePath } from 'next/cache'

import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/lib/supabase/types'

type FootingType =
  Database['public']['Tables']['footing_designs']['Row']['footing_type']

export type CreateFootingOutcome =
  | { ok: true; footingId: string }
  | { ok: false; error: string }

export async function createFootingDesignAction(
  formData: FormData,
): Promise<CreateFootingOutcome> {
  const projectId = (formData.get('project_id') as string | null)?.trim() ?? ''
  const label = (formData.get('label') as string | null)?.trim() ?? ''
  const footingType = ((formData.get('footing_type') as string | null) ?? 'isolated') as FootingType
  const columnDesignId = (formData.get('column_design_id') as string | null)?.trim() || null
  const nodeIdRaw = (formData.get('node_id') as string | null)?.trim() ?? ''
  const pickNum = (name: string, dflt: number) => {
    const v = Number.parseFloat((formData.get(name) as string | null) ?? '')
    return Number.isFinite(v) ? v : dflt
  }

  if (!projectId) return { ok: false, error: 'project_id is required' }
  if (!label) return { ok: false, error: 'Label is required (e.g. F-1)' }

  const node_id = nodeIdRaw === '' ? null : Number.parseInt(nodeIdRaw, 10)
  const length_x_mm = pickNum('length_x_mm', 2000)
  const width_y_mm = pickNum('width_y_mm', 2000)
  const depth_mm = pickNum('depth_mm', 500)
  const bearing_capacity_kPa = pickNum('bearing_capacity_kpa', 200)
  const soil_depth_mm = pickNum('soil_depth_mm', 1500)
  const fc_mpa = pickNum('fc_mpa', 28)
  const fy_mpa = pickNum('fy_mpa', 420)
  const clear_cover_mm = pickNum('clear_cover_mm', 75)

  const service = createServiceClient()
  const { data, error } = await service
    .from('footing_designs')
    .insert({
      project_id: projectId,
      label,
      footing_type: footingType,
      column_design_id: columnDesignId,
      node_id,
      length_x_mm,
      width_y_mm,
      depth_mm,
      bearing_capacity_kpa: bearing_capacity_kPa,
      soil_depth_mm,
      fc_mpa,
      fy_mpa,
      clear_cover_mm,
    })
    .select('id')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'insert failed'
    if (msg.includes('footing_designs_project_label_key'))
      return { ok: false, error: `A footing with label "${label}" already exists.` }
    return { ok: false, error: msg }
  }

  revalidatePath(`/projects/${projectId}/footings`)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true, footingId: data.id }
}

export type RunFootingOutcome =
  | { ok: true; status: 'pass' | 'fail' }
  | { ok: false; error: string }

export async function runFootingDesignAction(args: {
  projectId: string
  footingDesignId: string
}): Promise<RunFootingOutcome> {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${host}/api/design/footing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        project_id: args.projectId,
        footing_design_id: args.footingDesignId,
      }),
    })
    const json = (await res.json()) as
      | { ok: true; data: { status: 'pass' | 'fail' } }
      | { ok: false; error: string }
    if (!res.ok || !json.ok)
      return { ok: false, error: 'error' in json ? json.error : `HTTP ${res.status}` }
    revalidatePath(`/projects/${args.projectId}/footings`)
    revalidatePath(`/projects/${args.projectId}/footings/${args.footingDesignId}`)
    revalidatePath(`/projects/${args.projectId}/mto`)
    return { ok: true, status: json.data.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
