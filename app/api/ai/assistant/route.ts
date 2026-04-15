/**
 * POST /api/ai/assistant
 *
 * Streaming Claude assistant. Body:
 *   { project_id, messages: [{ role: 'user'|'assistant', content }] }
 *
 * The system prompt is built from the project snapshot — element
 * counts, governing forces, mismatches, MTO totals — so the model
 * answers in context without the client sending big payloads.
 *
 * Response: text/event-stream of token deltas. Client implementation
 * is in components/ai/AssistantPanel.tsx.
 *
 * Requires ANTHROPIC_API_KEY in the env.
 */
import { NextRequest } from 'next/server'

import { fail } from '@/lib/api/response'
import { env } from '@/lib/env'
import { buildProjectSnapshot, type ProjectSnapshot } from '@/lib/reports/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-sonnet-4-5'

type Message = { role: 'user' | 'assistant'; content: string }

type Body = {
  project_id: string
  messages: Message[]
}

function isBody(v: unknown): v is Body {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.project_id !== 'string') return false
  if (!Array.isArray(o.messages)) return false
  return o.messages.every((m) => {
    const r = (m as Record<string, unknown>).role
    const c = (m as Record<string, unknown>).content
    return (r === 'user' || r === 'assistant') && typeof c === 'string'
  })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid JSON body', 400) }
  if (!isBody(body)) return fail('Expected { project_id, messages: [{role,content}] }', 400)
  if (body.messages.length === 0) return fail('messages must be non-empty', 400)

  const snapshot = await buildProjectSnapshot(body.project_id)
  if (!snapshot) return fail('project not found', 404)

  const systemPrompt = buildSystemPrompt(snapshot)

  // Lazy import — keeps cold start light when the assistant isn't used.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
  })

  // Forward as SSE — one `data:` line per text delta.
  const encoder = new TextEncoder()
  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const payload = JSON.stringify({ delta: event.delta.text })
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(sse, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    },
  })
}

function buildSystemPrompt(snapshot: ProjectSnapshot): string {
  const { project, staad } = snapshot
  const lines: string[] = []

  lines.push(
    'You are the StructAI assistant — embedded in a structural-engineering design app.',
    'StructAI uses STAAD Pro as the geometry / analysis source and adds the design layer on top (concrete beams, columns, slabs, footings, plus material takeoff and reports).',
    'Answer concisely. Reference specific element labels, demands, and capacities from the project context below. Use kN, kN·m, MPa, mm units. When the user asks "why fail" or "what to do", point to the actual numbers and suggest a specific change (more bars, deeper section, etc.).',
    'When the answer requires data not in the context, say so plainly — do not fabricate numbers.',
    '',
    `## Project: ${project.name}`,
    project.client ? `Client: ${project.client}` : '',
    project.location ? `Location: ${project.location}` : '',
    `Code standard: ${project.code_standard}`,
  )

  if (staad) {
    lines.push(
      '',
      '## STAAD source',
      `File: ${staad.file_name ?? '—'}`,
      `Hash: ${(staad.file_hash ?? '').slice(0, 8).toUpperCase()}`,
      `Synced at: ${staad.synced_at ?? '—'}`,
      `Counts: ${staad.node_count} nodes · ${staad.member_count} members`,
      staad.mismatch_detected
        ? `⚠ STAAD MISMATCH on ${staad.mismatch_members.length} member(s) — designs may be unverified.`
        : '● In sync.',
    )
  } else {
    lines.push('', '## STAAD source', 'No sync on record yet.')
  }

  lines.push('', `## Beams (${snapshot.beams.length})`)
  for (const b of snapshot.beams.slice(0, 50)) {
    lines.push(
      `${b.label} · ${b.section_name} · members [${b.member_ids.join(',')}] · ${b.status}` +
      (b.demand ? ` · demand ${b.demand}` : '') +
      (b.capacity ? ` · cap ${b.capacity}` : ''),
    )
  }
  if (snapshot.beams.length > 50) lines.push(`(… ${snapshot.beams.length - 50} more)`)

  lines.push('', `## Columns (${snapshot.columns.length})`)
  for (const c of snapshot.columns.slice(0, 50)) {
    lines.push(
      `${c.label} · ${c.section_name} · members [${c.member_ids.join(',')}] · ${c.status}` +
      (c.demand ? ` · demand ${c.demand}` : '') +
      (c.capacity ? ` · ${c.capacity}` : ''),
    )
  }
  if (snapshot.columns.length > 50) lines.push(`(… ${snapshot.columns.length - 50} more)`)

  lines.push('', `## Slabs (${snapshot.slabs.length})`)
  for (const s of snapshot.slabs) {
    lines.push(`${s.label} · ${s.type} · ${s.span_x_mm}×${s.span_y_mm} t=${s.thickness_mm} · ${s.status}`)
  }

  lines.push('', `## Footings (${snapshot.footings.length})`)
  for (const f of snapshot.footings) {
    lines.push(`${f.label} · ${f.type} · ${f.size_mm} · ${f.status}`)
  }

  lines.push(
    '',
    '## MTO',
    `Total weight: ${snapshot.mto.total_weight_kg.toFixed(1)} kg · Largest Ø: ${snapshot.mto.largest_dia_mm}`,
  )

  return lines.filter(Boolean).join('\n')
}
