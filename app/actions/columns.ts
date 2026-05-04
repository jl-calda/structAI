'use server'

import { revalidatePath } from 'next/cache'

import { env as clientEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

void clientEnv

export type CreateColumnOutcome =
  | { ok: true; columnId: string }
  | { ok: false; error: string }

export async function createColumnDesignAction(
  formData: FormData,
): Promise<CreateColumnOutcome> {
  const projectId = (formData.get('project_id') as string | null)?.trim() ?? ''
  const label = (formData.get('label') as string | null)?.trim() ?? ''
  const inputMode = (formData.get('input_mode') as string | null)?.trim() ?? 'staad'
  const memberIdsRaw = (formData.get('member_ids') as string | null)?.trim() ?? ''
  const fcRaw = (formData.get('fc_mpa') as string | null)?.trim() ?? '28'
  const fyRaw = (formData.get('fy_mpa') as string | null)?.trim() ?? '420'
  const fysRaw = (formData.get('fys_mpa') as string | null)?.trim() ?? '420'
  const coverRaw = (formData.get('clear_cover_mm') as string | null)?.trim() ?? '40'

  if (!projectId) return { ok: false, error: 'project_id is required' }
  if (!label) return { ok: false, error: 'Label is required (e.g. C-1)' }

  const pickNum = (name: string, dflt: number) => {
    const v = Number.parseFloat((formData.get(name) as string | null) ?? '')
    return Number.isFinite(v) ? v : dflt
  }

  const fc = Number.parseFloat(fcRaw)
  const fy = Number.parseFloat(fyRaw)
  const fys = Number.parseFloat(fysRaw)
  const cover = Number.parseFloat(coverRaw)
  if (!Number.isFinite(fc) || !Number.isFinite(fy) || !Number.isFinite(fys))
    return { ok: false, error: 'Materials must be numeric (MPa).' }
  if (!Number.isFinite(cover))
    return { ok: false, error: 'Clear cover must be numeric (mm).' }

  let memberIds: number[] = []
  let sectionName: string
  let b_mm: number
  let h_mm: number
  let height_mm: number

  if (inputMode === 'manual') {
    b_mm = pickNum('b_mm', 0)
    h_mm = pickNum('h_mm', 0)
    height_mm = pickNum('height_mm', 0)
    if (b_mm <= 0 || h_mm <= 0 || height_mm <= 0) {
      return { ok: false, error: 'b, h, and height must be positive for manual mode.' }
    }
    sectionName = `${Math.round(b_mm)}X${Math.round(h_mm)}`
  } else {
    const parsed = memberIdsRaw
      .split(/[\s,]+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (parsed.length === 0)
      return { ok: false, error: 'At least one STAAD member ID is required.' }
    memberIds = parsed

    const supabase = await createClient()
    const { data: members, error: mErr } = await supabase
      .from('staad_members')
      .select('member_id, section_name, length_mm, member_type')
      .eq('project_id', projectId)
      .in('member_id', memberIds)
    if (mErr) return { ok: false, error: `staad_members: ${mErr.message}` }
    if (!members || members.length === 0)
      return { ok: false, error: 'None of the given member IDs exist in this project.' }

    const notColumn = members.filter((m) => m.member_type !== 'column')
    if (notColumn.length > 0) {
      return {
        ok: false,
        error: `Member(s) ${notColumn.map((m) => m.member_id).join(', ')} are not tagged as columns in STAAD.`,
      }
    }

    sectionName = members[0].section_name
    height_mm = members.reduce((s, m) => s + m.length_mm, 0)

    const { data: section, error: sErr } = await supabase
      .from('staad_sections')
      .select('b_mm, h_mm')
      .eq('project_id', projectId)
      .eq('section_name', sectionName)
      .maybeSingle()
    if (sErr) return { ok: false, error: `staad_sections: ${sErr.message}` }
    b_mm = section?.b_mm ?? 400
    h_mm = section?.h_mm ?? 400
  }

  const manualPu = inputMode === 'manual' ? pickNum('manual_pu_kn', 0) || null : null
  const manualMuMajor = inputMode === 'manual' ? pickNum('manual_mu_major_knm', 0) || null : null
  const manualMuMinor = inputMode === 'manual' ? pickNum('manual_mu_minor_knm', 0) || null : null
  const manualVu = inputMode === 'manual' ? pickNum('manual_vu_kn', 0) || null : null

  const service = createServiceClient()
  const { data, error } = await service
    .from('column_designs')
    .insert({
      project_id: projectId,
      label,
      member_ids: memberIds,
      section_name: sectionName,
      b_mm,
      h_mm,
      height_mm,
      fc_mpa: fc,
      fy_mpa: fy,
      fys_mpa: fys,
      clear_cover_mm: cover,
      manual_pu_kn: manualPu,
      manual_mu_major_knm: manualMuMajor,
      manual_mu_minor_knm: manualMuMinor,
      manual_vu_kn: manualVu,
    })
    .select('id')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'insert failed'
    if (msg.includes('column_designs_project_label_key'))
      return { ok: false, error: `A column with label "${label}" already exists in this project.` }
    return { ok: false, error: msg }
  }

  revalidatePath(`/projects/${projectId}/columns`)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true, columnId: data.id }
}

export type RunColumnDesignOutcome =
  | {
      ok: true
      status: 'pass' | 'fail'
      interaction_ratio: number
      axial_status: 'pass' | 'fail'
      shear_status: 'pass' | 'fail'
    }
  | { ok: false; error: string }

export async function runColumnDesignAction(args: {
  projectId: string
  columnDesignId: string
}): Promise<RunColumnDesignOutcome> {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${host}/api/design/column`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        project_id: args.projectId,
        column_design_id: args.columnDesignId,
      }),
    })
    const json = (await res.json()) as
      | { ok: true; data: { status: 'pass' | 'fail'; interaction_ratio: number; axial_status: 'pass' | 'fail'; shear_status: 'pass' | 'fail' } }
      | { ok: false; error: string }
    if (!res.ok || !json.ok)
      return { ok: false, error: (json && 'error' in json && json.error) || `HTTP ${res.status}` }
    revalidatePath(`/projects/${args.projectId}/columns`)
    revalidatePath(`/projects/${args.projectId}/columns/${args.columnDesignId}`)
    revalidatePath(`/projects/${args.projectId}/mto`)
    revalidatePath(`/projects/${args.projectId}`)
    return {
      ok: true,
      status: json.data.status,
      interaction_ratio: json.data.interaction_ratio,
      axial_status: json.data.axial_status,
      shear_status: json.data.shear_status,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
