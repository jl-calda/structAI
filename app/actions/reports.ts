'use server'

import { revalidatePath } from 'next/cache'

import type { ReportScope } from '@/lib/reports/document'

export type GenerateReportOutcome =
  | { ok: true; id: string; url: string | null; in_sync: boolean }
  | { ok: false; error: string }

export async function generateReportAction(args: {
  projectId: string
  scope: ReportScope
  title?: string
  engineerOfRecord?: string
}): Promise<GenerateReportOutcome> {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${host}/api/reports/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        project_id: args.projectId,
        scope: args.scope,
        title: args.title,
        engineer_of_record: args.engineerOfRecord,
      }),
    })
    const json = (await res.json()) as
      | { ok: true; data: { id: string; url: string | null; in_sync: boolean } }
      | { ok: false; error: string }
    if (!res.ok || !json.ok) {
      return { ok: false, error: 'error' in json ? json.error : `HTTP ${res.status}` }
    }
    revalidatePath(`/projects/${args.projectId}/reports`)
    revalidatePath(`/projects/${args.projectId}`)
    return { ok: true, id: json.data.id, url: json.data.url, in_sync: json.data.in_sync }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
