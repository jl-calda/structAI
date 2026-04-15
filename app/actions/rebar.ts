'use server'

import { revalidatePath } from 'next/cache'

import type { BeamTensionLayer } from '@/lib/supabase/types'

type BeamRebarInput = {
  perimeter_dia_mm: number
  tension_layers: BeamTensionLayer[]
  compression_dia_mm: number
  compression_count: number
  stirrup_dia_mm: number
  stirrup_legs: number
}

type ColumnRebarInput = {
  bar_dia_mm: number
  bar_count: number
  tie_dia_mm: number
  tie_spacing_mm: number
  tie_spacing_end_mm: number
  tie_end_zone_length_mm: number
}

export type RecheckOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

type BeamCheckPayload = {
  overall: 'pass' | 'fail'
  flexure_pos_status: 'pass' | 'fail' | 'pending'
  flexure_neg_status: 'pass' | 'fail' | 'pending'
  shear_status: 'pass' | 'fail' | 'pending'
  as_provided_mm2: number
  as_required_mm2: number
  phi_Mn_pos_kNm: number
  Mu_pos_kNm: number
  phi_Vn_kN: number
  Vu_kN: number
}

type ColumnCheckPayload = {
  overall: 'pass' | 'fail'
  axial_status: 'pass' | 'fail'
  shear_status: 'pass' | 'fail'
  interaction_ratio: number
  rho_percent: number
  rho_min_ok: boolean
  rho_max_ok: boolean
}

async function postCheck<TData>(path: string, body: unknown): Promise<RecheckOutcome<TData>> {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { ok: true; data: TData } | { ok: false; error: string }
    if (!res.ok || !json.ok) {
      return { ok: false, error: 'error' in json ? json.error : `HTTP ${res.status}` }
    }
    return { ok: true, data: json.data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function recheckBeamAction(args: {
  projectId: string
  beamDesignId: string
  rebar: BeamRebarInput
}): Promise<RecheckOutcome<BeamCheckPayload>> {
  const result = await postCheck<BeamCheckPayload>('/api/design/beam/check', {
    project_id: args.projectId,
    beam_design_id: args.beamDesignId,
    rebar: args.rebar,
  })
  if (result.ok) {
    revalidatePath(`/projects/${args.projectId}/beams/${args.beamDesignId}`)
    revalidatePath(`/projects/${args.projectId}/beams`)
    revalidatePath(`/projects/${args.projectId}/mto`)
    revalidatePath(`/projects/${args.projectId}`)
  }
  return result
}

export async function recheckColumnAction(args: {
  projectId: string
  columnDesignId: string
  rebar: ColumnRebarInput
}): Promise<RecheckOutcome<ColumnCheckPayload>> {
  const result = await postCheck<ColumnCheckPayload>('/api/design/column/check', {
    project_id: args.projectId,
    column_design_id: args.columnDesignId,
    rebar: args.rebar,
  })
  if (result.ok) {
    revalidatePath(`/projects/${args.projectId}/columns/${args.columnDesignId}`)
    revalidatePath(`/projects/${args.projectId}/columns`)
    revalidatePath(`/projects/${args.projectId}/mto`)
    revalidatePath(`/projects/${args.projectId}`)
  }
  return result
}
