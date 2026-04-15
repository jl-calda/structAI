/**
 * Slab MTO. Bars are counted per span × spacing, including temperature/
 * shrinkage bars and top continuity bars if specified.
 *
 * Bar marks (Phase 4):
 *   S1 — bottom bars short direction (main)
 *   S2 — bottom bars long direction (distribution / secondary main in two-way)
 *   S3 — top bars (if present)
 *   S4 — temp / shrinkage bars
 */
import 'server-only'

import type {
  BarShape,
  Database,
  ElementType,
} from '@/lib/supabase/types'

type SlabDesignRow = Database['public']['Tables']['slab_designs']['Row']
type SlabReinforcementRow =
  Database['public']['Tables']['slab_reinforcement']['Row']
type TakeoffRow =
  Database['public']['Tables']['material_takeoff_items']['Insert']

const STEEL_DENSITY_KG_M3 = 7850
const HOOK_ALLOWANCE_PER_END_MM = 80 // slab bars: short 90° hooks at supports

function unit_weight_kg_m(dia_mm: number): number {
  const area_m2 = (Math.PI * (dia_mm / 1000) ** 2) / 4
  return STEEL_DENSITY_KG_M3 * area_m2
}

/**
 * Count of bars across a span at a given spacing. First bar at spacing/2
 * from the edge, last bar at spacing/2 before the far edge.
 */
function bar_count(span_mm: number, spacing_mm: number): number {
  if (spacing_mm <= 0 || span_mm <= 0) return 0
  return Math.floor(span_mm / spacing_mm) + 1
}

export function buildSlabMto(
  design: Pick<
    SlabDesignRow,
    'id' | 'project_id' | 'label' | 'span_x_mm' | 'span_y_mm' | 'clear_cover_mm'
  >,
  rebar: SlabReinforcementRow,
): TakeoffRow[] {
  const rows: TakeoffRow[] = []
  const label = design.label
  const elementType: ElementType = 'slab'

  // S1 — bottom bars short direction. Length = long span (bars run in
  // short direction, so each bar covers the long dimension).
  if (rebar.bar_dia_short_mm > 0 && rebar.spacing_short_mm > 0) {
    const qty = bar_count(design.span_y_mm, rebar.spacing_short_mm)
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-S1`,
        bar_dia_mm: rebar.bar_dia_short_mm,
        bar_shape: 'straight',
        length_mm: design.span_x_mm + 2 * HOOK_ALLOWANCE_PER_END_MM,
        quantity: qty,
      }),
    )
  }

  // S2 — bottom bars long direction.
  if (rebar.bar_dia_long_mm > 0 && rebar.spacing_long_mm > 0) {
    const qty = bar_count(design.span_x_mm, rebar.spacing_long_mm)
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-S2`,
        bar_dia_mm: rebar.bar_dia_long_mm,
        bar_shape: 'straight',
        length_mm: design.span_y_mm + 2 * HOOK_ALLOWANCE_PER_END_MM,
        quantity: qty,
      }),
    )
  }

  // S3 — top continuity bars (if any).
  if (
    rebar.top_bar_dia_mm > 0 &&
    rebar.top_bar_spacing_mm > 0 &&
    rebar.top_bar_length_mm > 0
  ) {
    const qty = bar_count(design.span_y_mm, rebar.top_bar_spacing_mm)
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-S3`,
        bar_dia_mm: rebar.top_bar_dia_mm,
        bar_shape: 'straight',
        length_mm: rebar.top_bar_length_mm,
        quantity: qty,
      }),
    )
  }

  // S4 — temperature / shrinkage bars (perpendicular to main for
  // one-way slabs; additional in both directions for two-way is covered
  // by S1/S2 already).
  if (rebar.temp_bar_dia_mm > 0 && rebar.temp_bar_spacing_mm > 0) {
    const qty = bar_count(design.span_x_mm, rebar.temp_bar_spacing_mm)
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-S4`,
        bar_dia_mm: rebar.temp_bar_dia_mm,
        bar_shape: 'straight',
        length_mm: design.span_y_mm,
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
