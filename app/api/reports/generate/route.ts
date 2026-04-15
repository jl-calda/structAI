/**
 * POST /api/reports/generate
 *
 * Body: { project_id, scope, title?, engineer_of_record? }
 *
 * 1. Build the project snapshot.
 * 2. Render the PDF via @react-pdf/renderer (server-side renderToBuffer).
 * 3. Upload to Supabase Storage bucket `reports` at
 *    `{project_id}/{report_id}.pdf`.
 * 4. Insert design_reports row, return its id + storage URL.
 *
 * Storage bucket setup: the bucket must exist (created in Supabase
 * dashboard or via the JS API). On first call, if the bucket is
 * missing we create it.
 */
import { NextRequest } from 'next/server'
import React from 'react'

import { fail, ok } from '@/lib/api/response'
import { buildProjectSnapshot } from '@/lib/reports/context'
import { ReportDocument, type ReportScope } from '@/lib/reports/document'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STORAGE_BUCKET = 'reports'
const VALID_SCOPES: ReportScope[] = ['full', 'beams', 'columns', 'slabs', 'footings', 'mto']

type Body = {
  project_id: string
  scope: ReportScope
  title?: string
  engineer_of_record?: string | null
}

function isBody(v: unknown): v is Body {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.project_id === 'string' &&
    typeof o.scope === 'string' &&
    VALID_SCOPES.includes(o.scope as ReportScope)
  )
}

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid JSON body', 400) }
  if (!isBody(body)) return fail('Expected { project_id, scope }', 400)

  const supabase = createServiceClient()

  // 1. Snapshot.
  const snapshot = await buildProjectSnapshot(body.project_id)
  if (!snapshot) return fail('project not found', 404)

  // 2. Render PDF. `pdf().toBuffer()` is the server-side entrypoint.
  // We import lazily to keep the route's cold start light.
  let buffer: Buffer
  try {
    const { pdf } = await import('@react-pdf/renderer')
    const doc = React.createElement(ReportDocument, {
      snapshot,
      scope: body.scope,
      title: body.title?.trim() || `${snapshot.project.name} — Design Report`,
      engineerOfRecord: body.engineer_of_record?.trim() || null,
    })
    const stream = await pdf(doc).toBuffer()
    buffer = await streamToBuffer(stream)
  } catch (e) {
    return fail(`render: ${e instanceof Error ? e.message : String(e)}`, 500)
  }

  // 3. Upload to Storage. Reserve the report id up-front so the path is
  // deterministic and we can write the storage_url back into the row.
  const reportId = crypto.randomUUID()
  const path = `${body.project_id}/${reportId}.pdf`

  await ensureBucket(supabase)

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) return fail(`storage upload: ${upErr.message}`, 500)

  const { data: signed, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signErr) return fail(`storage sign: ${signErr.message}`, 500)

  // 4. Persist the metadata row.
  const isInSync = !!snapshot.staad && !snapshot.staad.mismatch_detected
  const { error: insErr } = await supabase.from('design_reports').insert({
    id: reportId,
    project_id: body.project_id,
    title: body.title?.trim() || `${snapshot.project.name} — Design Report`,
    engineer_of_record: body.engineer_of_record?.trim() || null,
    scope: body.scope,
    staad_file_name: snapshot.staad?.file_name ?? null,
    staad_file_hash: snapshot.staad?.file_hash ?? null,
    synced_at: snapshot.staad?.synced_at ?? null,
    is_in_sync: isInSync,
    storage_path: path,
    storage_url: signed?.signedUrl ?? null,
  })
  if (insErr) return fail(`design_reports insert: ${insErr.message}`, 500)

  return ok({
    id: reportId,
    url: signed?.signedUrl ?? null,
    bytes: buffer.byteLength,
    in_sync: isInSync,
  })
}

async function streamToBuffer(stream: NodeJS.ReadableStream | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) return stream
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

async function ensureBucket(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === STORAGE_BUCKET)
  if (exists) return
  // Private bucket; we serve via signed URLs only.
  await supabase.storage.createBucket(STORAGE_BUCKET, { public: false })
}
