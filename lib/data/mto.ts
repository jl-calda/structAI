/**
 * MTO read helpers. Server-only.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export type MtoRow =
  Database['public']['Tables']['material_takeoff_items']['Row']

export async function listMto(projectId: string): Promise<MtoRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('material_takeoff_items')
    .select('*')
    .eq('project_id', projectId)
    .order('bar_dia_mm', { ascending: true })
    .order('element_label', { ascending: true })
  if (error) throw new Error(`listMto: ${error.message}`)
  return data ?? []
}

export function summariseMto(rows: MtoRow[]) {
  const total_weight_kg = rows.reduce((s, r) => s + r.weight_kg, 0)
  const largest_dia = rows.reduce((m, r) => Math.max(m, r.bar_dia_mm), 0)
  const stirrups_kg = rows
    .filter((r) => r.bar_shape === 'closed_tie')
    .reduce((s, r) => s + r.weight_kg, 0)
  const other_kg = total_weight_kg - stirrups_kg
  return {
    total_weight_kg,
    largest_dia,
    stirrups_kg,
    other_kg,
  }
}

export function groupByDia(rows: MtoRow[]): Map<number, MtoRow[]> {
  const map = new Map<number, MtoRow[]>()
  for (const r of rows) {
    const bucket = map.get(r.bar_dia_mm) ?? []
    bucket.push(r)
    map.set(r.bar_dia_mm, bucket)
  }
  return map
}
