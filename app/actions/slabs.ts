'use server'

import { revalidatePath } from 'next/cache'

import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/lib/supabase/types'

type SlabType = Database['public']['Tables']['slab_designs']['Row']['slab_type']

export type CreateSlabOutcome =
  | { ok: true; slabId: string }
  | { ok: false; error: string }

export async function createSlabDesignAction(
  formData: FormData,
): Promise<CreateSlabOutcome> {
  const projectId = (formData.get('project_id') as string | null)?.trim() ?? ''
  const label = (formData.get('label') as string | null)?.trim() ?? ''
  const slabType = ((formData.get('slab_type') as string | null) ?? 'two_way') as SlabType
  const pickNum = (name: string, dflt: number) => {
    const v = Number.parseFloat((formData.get(name) as string | null) ?? '')
    return Number.isFinite(v) ? v : dflt
  }

  if (!projectId) return { ok: false, error: 'project_id is required' }
  if (!label) return { ok: false, error: 'Label is required (e.g. S-2A)' }

  const span_x_mm = pickNum('span_x_mm', 0)
  const span_y_mm = pickNum('span_y_mm', 0)
  const thickness_mm = pickNum('thickness_mm', 150)
  const fc_mpa = pickNum('fc_mpa', 28)
  const fy_mpa = pickNum('fy_mpa', 420)
  const clear_cover_mm = pickNum('clear_cover_mm', 20)
  const DL_self_kPa = pickNum('dl_self_kpa', (thickness_mm / 1000) * 24) // self weight γ = 24 kN/m³
  const SDL_kPa = pickNum('sdl_kpa', 1.0)
  const LL_kPa = pickNum('ll_kpa', 2.0)

  if (span_x_mm <= 0 || span_y_mm <= 0 || thickness_mm <= 0) {
    return { ok: false, error: 'Spans and thickness must be positive.' }
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('slab_designs')
    .insert({
      project_id: projectId,
      label,
      slab_type: slabType,
      span_x_mm,
      span_y_mm,
      thickness_mm,
      dl_self_kpa: DL_self_kPa,
      sdl_kpa: SDL_kPa,
      ll_kpa: LL_kPa,
      fc_mpa,
      fy_mpa,
      clear_cover_mm,
    })
    .select('id')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'insert failed'
    if (msg.includes('slab_designs_project_label_key'))
      return { ok: false, error: `A slab with label "${label}" already exists.` }
    return { ok: false, error: msg }
  }

  revalidatePath(`/projects/${projectId}/slabs`)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true, slabId: data.id }
}

export type RunSlabOutcome =
  | { ok: true; status: 'pass' | 'fail' }
  | { ok: false; error: string }

export async function runSlabDesignAction(args: {
  projectId: string
  slabDesignId: string
}): Promise<RunSlabOutcome> {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${host}/api/design/slab`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        project_id: args.projectId,
        slab_design_id: args.slabDesignId,
      }),
    })
    const json = (await res.json()) as
      | { ok: true; data: { status: 'pass' | 'fail' } }
      | { ok: false; error: string }
    if (!res.ok || !json.ok)
      return { ok: false, error: 'error' in json ? json.error : `HTTP ${res.status}` }
    revalidatePath(`/projects/${args.projectId}/slabs`)
    revalidatePath(`/projects/${args.projectId}/slabs/${args.slabDesignId}`)
    revalidatePath(`/projects/${args.projectId}/mto`)
    return { ok: true, status: json.data.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
