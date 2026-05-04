'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { SupportCondition } from '@/lib/supabase/types'

export type CreateBeamOutcome =
  | { ok: true; beamId: string }
  | { ok: false; error: string }

export async function createBeamDesignAction(formData: FormData): Promise<CreateBeamOutcome> {
  const projectId = (formData.get('project_id') as string | null)?.trim() ?? ''
  const label = (formData.get('label') as string | null)?.trim() ?? ''
  const inputMode = (formData.get('input_mode') as string | null)?.trim() ?? 'staad'
  const memberIdsRaw = (formData.get('member_ids') as string | null)?.trim() ?? ''
  const fcRaw = (formData.get('fc_mpa') as string | null)?.trim() ?? '28'
  const fyRaw = (formData.get('fy_mpa') as string | null)?.trim() ?? '420'
  const fysRaw = (formData.get('fys_mpa') as string | null)?.trim() ?? '420'
  const coverRaw = (formData.get('clear_cover_mm') as string | null)?.trim() ?? '40'

  if (!projectId) return { ok: false, error: 'project_id is required' }
  if (!label) return { ok: false, error: 'Label is required (e.g. B-12)' }

  const pickNum = (name: string, dflt: number) => {
    const v = Number.parseFloat((formData.get(name) as string | null) ?? '')
    return Number.isFinite(v) ? v : dflt
  }

  const fc = Number.parseFloat(fcRaw)
  const fy = Number.parseFloat(fyRaw)
  const fys = Number.parseFloat(fysRaw)
  const cover = Number.parseFloat(coverRaw)
  if (!Number.isFinite(fc) || !Number.isFinite(fy) || !Number.isFinite(fys)) {
    return { ok: false, error: 'Materials must be numeric (MPa).' }
  }
  if (!Number.isFinite(cover)) {
    return { ok: false, error: 'Clear cover must be numeric (mm).' }
  }

  let memberIds: number[] = []
  let sectionName: string
  let b_mm: number
  let h_mm: number
  let totalSpan: number

  if (inputMode === 'manual') {
    b_mm = pickNum('b_mm', 0)
    h_mm = pickNum('h_mm', 0)
    totalSpan = pickNum('total_span_mm', 0)
    if (b_mm <= 0 || h_mm <= 0 || totalSpan <= 0) {
      return { ok: false, error: 'b, h, and span must be positive for manual mode.' }
    }
    sectionName = `${Math.round(b_mm)}X${Math.round(h_mm)}`
  } else {
    const parsed = memberIdsRaw
      .split(/[\s,]+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (parsed.length === 0) {
      return { ok: false, error: 'At least one STAAD member ID is required.' }
    }
    memberIds = parsed

    const supabase = await createClient()
    const { data: members, error: mErr } = await supabase
      .from('staad_members')
      .select('member_id, section_name, length_mm, member_type')
      .eq('project_id', projectId)
      .in('member_id', memberIds)
    if (mErr) return { ok: false, error: `staad_members: ${mErr.message}` }
    if (!members || members.length === 0) {
      return { ok: false, error: 'None of the given member IDs exist in this project.' }
    }

    const notBeam = members.filter((m) => m.member_type !== 'beam')
    if (notBeam.length > 0) {
      return {
        ok: false,
        error: `Member(s) ${notBeam.map((m) => m.member_id).join(', ')} are not tagged as beams in STAAD.`,
      }
    }

    sectionName = members[0].section_name
    totalSpan = members.reduce((s, m) => s + m.length_mm, 0)

    const { data: section, error: sErr } = await supabase
      .from('staad_sections')
      .select('b_mm, h_mm')
      .eq('project_id', projectId)
      .eq('section_name', sectionName)
      .maybeSingle()
    if (sErr) return { ok: false, error: `staad_sections: ${sErr.message}` }
    b_mm = section?.b_mm ?? 300
    h_mm = section?.h_mm ?? 600
  }

  const manualWu = inputMode === 'manual' ? pickNum('manual_wu_kn_m', 0) : null
  const manualPu = inputMode === 'manual' ? pickNum('manual_pu_mid_kn', 0) : null
  const supportCond = inputMode === 'manual'
    ? ((formData.get('support_condition') as string | null) ?? 'simply_supported') as SupportCondition
    : 'simply_supported' as SupportCondition

  const service = createServiceClient()
  const { data, error } = await service
    .from('beam_designs')
    .insert({
      project_id: projectId,
      label,
      member_ids: memberIds,
      section_name: sectionName,
      b_mm,
      h_mm,
      total_span_mm: totalSpan,
      fc_mpa: fc,
      fy_mpa: fy,
      fys_mpa: fys,
      clear_cover_mm: cover,
      manual_wu_kn_m: manualWu || null,
      manual_pu_mid_kn: manualPu || null,
      support_condition: supportCond,
    })
    .select('id')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'insert failed'
    if (msg.includes('beam_designs_project_label_key')) {
      return { ok: false, error: `A beam with label "${label}" already exists in this project.` }
    }
    return { ok: false, error: msg }
  }

  revalidatePath(`/projects/${projectId}/beams`)
  revalidatePath(`/projects/${projectId}`)
  return { ok: true, beamId: data.id }
}

export async function createBeamDesignAndOpen(formData: FormData) {
  const result = await createBeamDesignAction(formData)
  if (!result.ok) return result
  const projectId = formData.get('project_id') as string
  redirect(`/projects/${projectId}/beams/${result.beamId}`)
}

export type RunDesignOutcome =
  | {
      ok: true
      status: 'pass' | 'fail'
      iterations: number
      reason: string | null
      beams: { label: string; overall: 'pass' | 'fail' }[]
    }
  | { ok: false; error: string }

/**
 * Thin wrapper calling the POST /api/design/beam endpoint — this gives
 * the server action a single code path even when the UI has a group of
 * beams to run together in the future.
 */
export async function runBeamDesignAction(args: {
  projectId: string
  beamDesignIds: string[]
}): Promise<RunDesignOutcome> {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${host}/api/design/beam`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        project_id: args.projectId,
        beam_design_ids: args.beamDesignIds,
      }),
    })
    const json = (await res.json()) as
      | { ok: true; data: RunDesignOutcome extends { ok: true } ? unknown : never }
      | { ok: false; error: string }
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json && 'error' in json ? json.error : `HTTP ${res.status}`,
      }
    }
    const data = (json.data as {
      status: 'pass' | 'fail'
      iterations: number
      reason: string | null
      beams: { label: string; overall: 'pass' | 'fail' }[]
    })
    revalidatePath(`/projects/${args.projectId}/beams`)
    for (const id of args.beamDesignIds) {
      revalidatePath(`/projects/${args.projectId}/beams/${id}`)
    }
    revalidatePath(`/projects/${args.projectId}/mto`)
    revalidatePath(`/projects/${args.projectId}`)
    return {
      ok: true,
      status: data.status,
      iterations: data.iterations,
      reason: data.reason,
      beams: data.beams,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}
