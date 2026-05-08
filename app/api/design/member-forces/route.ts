import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/design/member-forces?projectId=X&memberIds=1,2,3
 *
 * Returns per-member envelope data and stitched forces for a set of members.
 * Used by MemberLoadsCard to display forces for user-defined member groups.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  const memberIdsParam = req.nextUrl.searchParams.get('memberIds')

  if (!projectId || !memberIdsParam) {
    return NextResponse.json({ ok: false, error: 'Missing projectId or memberIds' }, { status: 400 })
  }

  const memberIds = memberIdsParam.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
  if (memberIds.length === 0) {
    return NextResponse.json({ ok: true, data: { members: [], envelope: null, totalSpan: 0 } })
  }

  const supabase = await createClient()

  const [membersRes, envelopeRes] = await Promise.all([
    supabase
      .from('staad_members')
      .select('member_id, section_name, length_mm, member_type')
      .eq('project_id', projectId)
      .in('member_id', memberIds),
    supabase
      .from('staad_envelope')
      .select('member_id, mpos_max_knm, mpos_combo, mneg_max_knm, mneg_combo, vu_max_kn, vu_combo, nu_tension_max_kn, nu_compression_max_kn, mpos_max_minor_knm, mneg_max_minor_knm')
      .eq('project_id', projectId)
      .in('member_id', memberIds),
  ])

  if (membersRes.error) {
    return NextResponse.json({ ok: false, error: membersRes.error.message }, { status: 500 })
  }
  if (envelopeRes.error) {
    return NextResponse.json({ ok: false, error: envelopeRes.error.message }, { status: 500 })
  }

  const members = (membersRes.data ?? []).map(m => ({
    member_id: m.member_id,
    section_name: m.section_name,
    length_mm: m.length_mm,
    member_type: m.member_type,
  }))

  const totalSpan = memberIds.reduce((sum, id) => {
    const m = members.find(mm => mm.member_id === id)
    return sum + (m?.length_mm ?? 0)
  }, 0)

  const envelopes = envelopeRes.data ?? []
  const combined = {
    mpos_max: Math.max(0, ...envelopes.map(e => e.mpos_max_knm)),
    mneg_max: Math.max(0, ...envelopes.map(e => Math.abs(e.mneg_max_knm))),
    vu_max: Math.max(0, ...envelopes.map(e => e.vu_max_kn)),
    nu_comp_max: Math.max(0, ...envelopes.map(e => e.nu_compression_max_kn)),
    nu_tens_max: Math.max(0, ...envelopes.map(e => Math.abs(e.nu_tension_max_kn))),
    mpos_minor_max: Math.max(0, ...envelopes.map(e => e.mpos_max_minor_knm)),
    mneg_minor_max: Math.max(0, ...envelopes.map(e => Math.abs(e.mneg_max_minor_knm))),
    mpos_combo: envelopes.reduce((best, e) => e.mpos_max_knm > (best?.mpos_max_knm ?? 0) ? e : best, envelopes[0])?.mpos_combo ?? null,
    mneg_combo: envelopes.reduce((best, e) => Math.abs(e.mneg_max_knm) > Math.abs(best?.mneg_max_knm ?? 0) ? e : best, envelopes[0])?.mneg_combo ?? null,
    vu_combo: envelopes.reduce((best, e) => e.vu_max_kn > (best?.vu_max_kn ?? 0) ? e : best, envelopes[0])?.vu_combo ?? null,
  }

  return NextResponse.json({
    ok: true,
    data: {
      members,
      perMember: envelopes.map(e => ({
        member_id: e.member_id,
        mpos: e.mpos_max_knm,
        mneg: e.mneg_max_knm,
        vu: e.vu_max_kn,
        nu_comp: e.nu_compression_max_kn,
        nu_tens: e.nu_tension_max_kn,
        mpos_minor: e.mpos_max_minor_knm,
        mneg_minor: e.mneg_max_minor_knm,
      })),
      envelope: combined,
      totalSpan,
    },
  })
}
