import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/design/section-forces?projectId=X&memberIds=1,2&combos=100-124
 *
 * Returns the raw 11-point section-force samples per member per combo.
 * Used by the section-forces table in the MemberLoadsCard for verification.
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
    return NextResponse.json({ ok: true, data: { points: [] } })
  }

  const comboNumbers = combosParam ? parseComboRanges(combosParam) : null
  const supabase = await createClient()

  let query = supabase
    .from('staad_diagram_points')
    .select('member_id, combo_number, x_ratio, x_mm, mz_knm, vy_kn, n_kn, my_knm, vz_kn')
    .eq('project_id', projectId)
    .in('member_id', memberIds)
    .order('member_id', { ascending: true })
    .order('combo_number', { ascending: true })
    .order('x_ratio', { ascending: true })

  if (comboNumbers && comboNumbers.length > 0) {
    query = query.in('combo_number', comboNumbers)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: { points: data ?? [] } })
}

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
