import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/design/member-forces?projectId=X&memberIds=1,2,3&combos=100-124,200-211
 *
 * Returns per-member envelope data for a set of members.
 * When `combos` is provided, computes the envelope from diagram_points
 * filtered to those combo numbers only (instead of using pre-computed staad_envelope).
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  const memberIdsParam = req.nextUrl.searchParams.get('memberIds')
  const combosParam = req.nextUrl.searchParams.get('combos')

  if (!projectId || !memberIdsParam) {
    return NextResponse.json({ ok: false, error: 'Missing projectId or memberIds' }, { status: 400 })
  }

  const memberIds = memberIdsParam.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
  if (memberIds.length === 0) {
    return NextResponse.json({ ok: true, data: { members: [], envelope: null, totalSpan: 0 } })
  }

  // Parse combo ranges: "100-124,200-211" → [100,101,...,124,200,...,211]
  const comboNumbers = combosParam ? parseComboRanges(combosParam) : null

  const supabase = await createClient()

  const membersRes = await supabase
    .from('staad_members')
    .select('member_id, section_name, length_mm, member_type')
    .eq('project_id', projectId)
    .in('member_id', memberIds)

  if (membersRes.error) {
    return NextResponse.json({ ok: false, error: membersRes.error.message }, { status: 500 })
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

  // If combo filter is specified, compute envelope from diagram_points
  if (comboNumbers && comboNumbers.length > 0) {
    const diagRes = await supabase
      .from('staad_diagram_points')
      .select('member_id, combo_number, mz_knm, vy_kn, n_kn, my_knm')
      .eq('project_id', projectId)
      .in('member_id', memberIds)
      .in('combo_number', comboNumbers)

    if (diagRes.error) {
      return NextResponse.json({ ok: false, error: diagRes.error.message }, { status: 500 })
    }

    const points = diagRes.data ?? []

    // Compute per-member envelope from filtered points
    const perMember = memberIds.map(mid => {
      const pts = points.filter(p => p.member_id === mid)
      let mpos = 0, mneg = 0, vu = 0, nuComp = 0, nuTens = 0
      let mposCombo: number | null = null, mnegCombo: number | null = null, vuCombo: number | null = null

      for (const p of pts) {
        const mz = p.mz_knm ?? 0
        const vy = Math.abs(p.vy_kn ?? 0)
        const n = p.n_kn ?? 0

        if (mz > mpos) { mpos = mz; mposCombo = p.combo_number }
        if (mz < mneg) { mneg = mz; mnegCombo = p.combo_number }
        if (vy > vu) { vu = vy; vuCombo = p.combo_number }
        if (n < 0 && Math.abs(n) > nuComp) nuComp = Math.abs(n)
        if (n > 0 && n > nuTens) nuTens = n
      }

      return {
        member_id: mid,
        mpos, mneg: Math.abs(mneg), vu, nu_comp: nuComp, nu_tens: nuTens,
        mpos_minor: 0, mneg_minor: 0,
        mpos_combo: mposCombo, mneg_combo: mnegCombo, vu_combo: vuCombo,
      }
    })

    const envelope = {
      mpos_max: Math.max(0, ...perMember.map(m => m.mpos)),
      mneg_max: Math.max(0, ...perMember.map(m => m.mneg)),
      vu_max: Math.max(0, ...perMember.map(m => m.vu)),
      nu_comp_max: Math.max(0, ...perMember.map(m => m.nu_comp)),
      nu_tens_max: Math.max(0, ...perMember.map(m => m.nu_tens)),
      mpos_minor_max: 0,
      mneg_minor_max: 0,
      mpos_combo: perMember.reduce((best, m) => m.mpos > (best?.mpos ?? 0) ? m : best, perMember[0])?.mpos_combo ?? null,
      mneg_combo: perMember.reduce((best, m) => m.mneg > (best?.mneg ?? 0) ? m : best, perMember[0])?.mneg_combo ?? null,
      vu_combo: perMember.reduce((best, m) => m.vu > (best?.vu ?? 0) ? m : best, perMember[0])?.vu_combo ?? null,
    }

    return NextResponse.json({
      ok: true,
      data: { members, perMember, envelope, totalSpan, combosUsed: comboNumbers.length },
    })
  }

  // Default: use pre-computed staad_envelope (all combos)
  const envelopeRes = await supabase
    .from('staad_envelope')
    .select('member_id, mpos_max_knm, mpos_combo, mneg_max_knm, mneg_combo, vu_max_kn, vu_combo, nu_tension_max_kn, nu_compression_max_kn, mpos_max_minor_knm, mneg_max_minor_knm')
    .eq('project_id', projectId)
    .in('member_id', memberIds)

  if (envelopeRes.error) {
    return NextResponse.json({ ok: false, error: envelopeRes.error.message }, { status: 500 })
  }

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

/** Parse "100-124,200-211,150" → [100,101,...,124,200,...,211,150] */
function parseComboRanges(str: string): number[] {
  const result: number[] = []
  for (const part of str.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const dash = trimmed.indexOf('-')
    if (dash > 0) {
      const start = Number(trimmed.slice(0, dash))
      const end = Number(trimmed.slice(dash + 1))
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let i = start; i <= end; i++) result.push(i)
      }
    } else {
      const n = Number(trimmed)
      if (Number.isFinite(n)) result.push(n)
    }
  }
  return [...new Set(result)]
}
