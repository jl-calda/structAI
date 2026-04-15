/**
 * Footing MTO. Phase 4b MVP: bottom mat only (bars both directions).
 * Top mat for uplift / moment-inversion footings is a later addition.
 *
 * Bar marks: F1 = bottom bars long direction, F2 = bottom bars short
 * direction.
 */
import 'server-only'

import type {
  BarShape,
  Database,
  ElementType,
} from '@/lib/supabase/types'

type FootingDesignRow = Database['public']['Tables']['footing_designs']['Row']
type TakeoffRow =
  Database['public']['Tables']['material_takeoff_items']['Insert']

const STEEL_DENSITY_KG_M3 = 7850
const HOOK_ALLOWANCE_PER_END_MM = 100

function unit_weight_kg_m(dia_mm: number): number {
  const area_m2 = (Math.PI * (dia_mm / 1000) ** 2) / 4
  return STEEL_DENSITY_KG_M3 * area_m2
}

function bar_count(span_mm: number, spacing_mm: number): number {
  if (spacing_mm <= 0 || span_mm <= 0) return 0
  return Math.floor(span_mm / spacing_mm) + 1
}

export function buildFootingMto(
  design: Pick<
    FootingDesignRow,
    'id' | 'project_id' | 'label' | 'length_x_mm' | 'width_y_mm' | 'depth_mm' | 'clear_cover_mm'
  >,
  bottom_bar_dia_mm: number,
  bottom_spacing_long_mm: number,
  bottom_spacing_short_mm: number,
): TakeoffRow[] {
  const rows: TakeoffRow[] = []
  const label = design.label
  const elementType: ElementType = 'footing'

  // F1 — long-direction bars (each bar's length = Lx, count across Ly).
  if (bottom_bar_dia_mm > 0 && bottom_spacing_long_mm > 0) {
    const qty = bar_count(design.width_y_mm, bottom_spacing_long_mm)
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-F1`,
        bar_dia_mm: bottom_bar_dia_mm,
        bar_shape: 'straight',
        length_mm: design.length_x_mm - 2 * design.clear_cover_mm + 2 * HOOK_ALLOWANCE_PER_END_MM,
        quantity: qty,
      }),
    )
  }

  // F2 — short-direction bars (each bar's length = Ly, count across Lx).
  if (bottom_bar_dia_mm > 0 && bottom_spacing_short_mm > 0) {
    const qty = bar_count(design.length_x_mm, bottom_spacing_short_mm)
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-F2`,
        bar_dia_mm: bottom_bar_dia_mm,
        bar_shape: 'straight',
        length_mm: design.width_y_mm - 2 * design.clear_cover_mm + 2 * HOOK_ALLOWANCE_PER_END_MM,
        quantity: qty,
      }),
    )
  }

  return rows
}

function makeRow(args: {
  project_id: string
  element_id: string
  element_label: string
  element_type: ElementType
  bar_mark: string
  bar_dia_mm: number
  bar_shape: BarShape
  length_mm: number
  quantity: number
}): TakeoffRow {
  const total_length_m = (args.length_mm * args.quantity) / 1000
  const uw = unit_weight_kg_m(args.bar_dia_mm)
  return {
    project_id: args.project_id,
    element_id: args.element_id,
    element_label: args.element_label,
    element_type: args.element_type,
    bar_mark: args.bar_mark,
    bar_dia_mm: args.bar_dia_mm,
    bar_shape: args.bar_shape,
    length_mm: args.length_mm,
    quantity: args.quantity,
    total_length_m,
    unit_weight_kg_m: uw,
    weight_kg: total_length_m * uw,
  }
}
