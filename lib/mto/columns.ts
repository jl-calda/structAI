/**
 * Column MTO generator.
 * Same shape as lib/mto/beams.ts.
 *
 * Bar marks (Phase 4):
 *   C1 — longitudinal vertical bars (continuous over full column height
 *        + an allowance for the lap splice at each floor — here we add
 *        a full 1.3·Ld allowance approximated as 40·db, the old
 *        rule-of-thumb).
 *   C2 — ties (closed rectangular tie with a 135° hook). Quantity is
 *        derived from end-zone dense spacing at both ends + mid-height
 *        relaxed spacing.
 */
import 'server-only'

import type {
  BarShape,
  Database,
  ElementType,
} from '@/lib/supabase/types'

type ColumnDesignRow = Database['public']['Tables']['column_designs']['Row']
type ColumnReinforcementRow =
  Database['public']['Tables']['column_reinforcement']['Row']
type TakeoffRow =
  Database['public']['Tables']['material_takeoff_items']['Insert']

const STEEL_DENSITY_KG_M3 = 7850
const HOOK_ALLOWANCE_PER_END_MM = 120

function unit_weight_kg_m(dia_mm: number): number {
  const area_m2 = (Math.PI * (dia_mm / 1000) ** 2) / 4
  return STEEL_DENSITY_KG_M3 * area_m2
}

function tie_length_mm(
  b_mm: number,
  h_mm: number,
  clear_cover_mm: number,
): number {
  const bInner = Math.max(0, b_mm - 2 * clear_cover_mm)
  const hInner = Math.max(0, h_mm - 2 * clear_cover_mm)
  return 2 * bInner + 2 * hInner + 2 * HOOK_ALLOWANCE_PER_END_MM
}

/** Number of ties across the full column height given mixed zones. */
function tie_count(
  height_mm: number,
  end_zone_length_mm: number,
  end_spacing_mm: number,
  mid_spacing_mm: number,
): number {
  if (height_mm <= 0) return 0

  const endZones = 2 * Math.min(end_zone_length_mm, height_mm / 2)
  const midZone = Math.max(0, height_mm - endZones)

  const endCount =
    end_spacing_mm > 0
      ? Math.ceil(endZones / end_spacing_mm)
      : 0
  const midCount =
    mid_spacing_mm > 0 ? Math.ceil(midZone / mid_spacing_mm) : 0

  return endCount + midCount + 1 // +1 for the closing tie at the end
}

export function buildColumnMto(
  design: Pick<
    ColumnDesignRow,
    | 'id'
    | 'project_id'
    | 'label'
    | 'b_mm'
    | 'h_mm'
    | 'height_mm'
    | 'clear_cover_mm'
  >,
  rebar: ColumnReinforcementRow,
): TakeoffRow[] {
  const rows: TakeoffRow[] = []
  const label = design.label
  const elementType: ElementType = 'column'

  // Longitudinal bars — cast length = column height + lap allowance.
  // 40·db is a common rule-of-thumb approximation of 1.3·Ld for Gr60.
  const lapAllowance = 40 * rebar.bar_dia_mm
  if (rebar.bar_count > 0 && rebar.bar_dia_mm > 0) {
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-C1`,
        bar_dia_mm: rebar.bar_dia_mm,
        bar_shape: 'straight',
        length_mm: design.height_mm + lapAllowance,
        quantity: rebar.bar_count,
      }),
    )
  }

  // Ties.
  if (rebar.tie_dia_mm > 0) {
    const qty = tie_count(
      design.height_mm,
      rebar.tie_end_zone_length_mm,
      rebar.tie_spacing_end_mm,
      rebar.tie_spacing_mm,
    )
    if (qty > 0) {
      rows.push(
        makeRow({
          project_id: design.project_id,
          element_id: design.id,
          element_label: label,
          element_type: elementType,
          bar_mark: `${label}-C2`,
          bar_dia_mm: rebar.tie_dia_mm,
          bar_shape: 'closed_tie',
          length_mm: tie_length_mm(
            design.b_mm,
            design.h_mm,
            design.clear_cover_mm,
          ),
          quantity: qty,
        }),
      )
    }
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
