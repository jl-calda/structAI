'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { CodeStandard } from '@/lib/supabase/types'

const CODE_STANDARDS: CodeStandard[] = [
  'NSCP_2015',
  'ACI_318_19',
  'EC2_2004',
  'AS_3600_2018',
  'CSA_A23_3_19',
]

export async function createProject(formData: FormData) {
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  const description = (formData.get('description') as string | null)?.trim() ?? ''
  const client = (formData.get('client') as string | null)?.trim() ?? ''
  const location = (formData.get('location') as string | null)?.trim() ?? ''
  const codeStandardRaw = formData.get('code_standard') as string | null

  if (!name) {
    return { ok: false, error: 'Project name is required.' }
  }

  const code_standard: CodeStandard = CODE_STANDARDS.includes(
    codeStandardRaw as CodeStandard,
  )
    ? (codeStandardRaw as CodeStandard)
    : 'NSCP_2015'

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name,
      description: description || null,
      client: client || null,
      location: location || null,
      code_standard,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create project.' }
  }

  revalidatePath('/dashboard')
  redirect(`/projects/${data.id}`)
}

export async function setProjectCodeStandardAction(
  projectId: string,
  next: CodeStandard,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CODE_STANDARDS.includes(next)) {
    return { ok: false, error: 'Invalid code standard.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update({ code_standard: next })
    .eq('id', projectId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/projects/${projectId}`)
  return { ok: true }
}

export async function updateProjectDefaultsAction(
  projectId: string,
  defaults: {
    name?: string
    description?: string | null
    client?: string | null
    location?: string | null
    default_fc_mpa?: number
    default_fy_mpa?: number
    default_fys_mpa?: number
    default_clear_cover_mm?: number
    default_density_kn_m3?: number
    seismic_zone?: string
    exposure_class?: string
    aggregate_type?: string
    lightweight_lambda?: number
    engineer_name?: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update(defaults)
    .eq('id', projectId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/setup`)
  return { ok: true }
}
