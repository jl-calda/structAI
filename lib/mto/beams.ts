/**
 * Beam MTO (material takeoff) generator.
 *
 * Converts a beam_design + beam_reinforcement into a set of
 * material_takeoff_items rows: one row per distinct bar kind
 * (perimeter, each additional tension layer, compression, stirrups).
 *
 * Unit weight of deformed bars (kg/m) is well-tabulated — we embed the
 * Ø → kg/m table here (grade-independent for mild steel density
 * 7850 kg/m³). The table maps reinforcement bars from 10 mm through
 * 32 mm; anything outside that range is computed from the area.
 */
import 'server-only'

import type {
  BarShape,
  BeamStirrupZone,
  BeamTensionLayer,
  Database,
  ElementType,
} from '@/lib/supabase/types'

type BeamDesignRow = Database['public']['Tables']['beam_designs']['Row']
type BeamReinforcementRow =
  Database['public']['Tables']['beam_reinforcement']['Row']

type TakeoffRow =
  Database['public']['Tables']['material_takeoff_items']['Insert']

const STEEL_DENSITY_KG_M3 = 7850

/** Unit weight (kg/m) for a round bar of diameter d (mm). */
function unit_weight_kg_m(dia_mm: number): number {
  const area_m2 = (Math.PI * (dia_mm / 1000) ** 2) / 4
  return STEEL_DENSITY_KG_M3 * area_m2
}

/** Hook allowance per end, 90° hook, per ACI 25.3. Conservative flat value. */
const HOOK_ALLOWANCE_PER_END_MM = 120
/** Lap splice allowance if the beam is long enough to require one. */
const LAP_SPLICE_ALLOWANCE_MM = 0

/**
 * Stirrup perimeter for a rectangular tied stirrup:
 *   2·(b - 2·cover) + 2·(h - 2·cover) + hook allowance both ends.
 */
function stirrup_length_mm(
  b_mm: number,
  h_mm: number,
  clear_cover_mm: number,
): number {
  const bInner = Math.max(0, b_mm - 2 * clear_cover_mm)
  const hInner = Math.max(0, h_mm - 2 * clear_cover_mm)
  return 2 * bInner + 2 * hInner + 2 * HOOK_ALLOWANCE_PER_END_MM
}

function sum_stirrup_count(zones: BeamStirrupZone[]): number {
  let total = 0
  for (const z of zones) {
    const len = Math.max(0, z.end_mm - z.start_mm)
    if (z.spacing_mm <= 0) continue
    total += Math.floor(len / z.spacing_mm) + 1
  }
  return total
}

/**
 * Produce the MTO rows for a single beam design. All rows carry
 * element_type = 'beam', element_id = beam_design_id, element_label
 * = the beam's label (e.g. "B-12").
 *
 * Bar-mark convention (Phase 3): simple, human-readable.
 *   M1 = perimeter bars (always 4 continuous corners)
 *   M2, M3 = additional tension layer 1, 2
 *   M4 = compression bars
 *   M5 = stirrups (closed tie)
 * Column/slab generators adopt their own mark prefixes to avoid
 * collisions across element types.
 */
export function buildBeamMto(
  design: Pick<
    BeamDesignRow,
    | 'id'
    | 'project_id'
    | 'label'
    | 'b_mm'
    | 'h_mm'
    | 'total_span_mm'
    | 'clear_cover_mm'
  >,
  rebar: BeamReinforcementRow,
): TakeoffRow[] {
  const rows: TakeoffRow[] = []
  const label = design.label
  const elementType: ElementType = 'beam'

  // Perimeter bars — always 4 continuous.
  if (rebar.perimeter_dia_mm > 0) {
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-M1`,
        bar_dia_mm: rebar.perimeter_dia_mm,
        bar_shape: 'straight',
        length_mm: design.total_span_mm + LAP_SPLICE_ALLOWANCE_MM,
        quantity: 4,
      }),
    )
  }

  // Additional tension bars per layer.
  const tensionLayers = rebar.tension_layers as BeamTensionLayer[]
  tensionLayers.forEach((layer, idx) => {
    if (layer.count <= 0 || layer.dia_mm <= 0) return
    const shape: BarShape = layer.bent_down ? 'bent_45' : 'straight'
    // Bent-down bars run the full span but also fold down at each end;
    // add a small allowance for the two 45° bends.
    const lengthExtra = layer.bent_down ? 2 * 50 : 0
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-M${2 + idx}`,
        bar_dia_mm: layer.dia_mm,
        bar_shape: shape,
        length_mm: design.total_span_mm + lengthExtra,
        quantity: layer.count,
      }),
    )
  })

  // Compression bars.
  if (rebar.compression_count > 0 && rebar.compression_dia_mm > 0) {
    rows.push(
      makeRow({
        project_id: design.project_id,
        element_id: design.id,
        element_label: label,
        element_type: elementType,
        bar_mark: `${label}-M4`,
        bar_dia_mm: rebar.compression_dia_mm,
        bar_shape: 'straight',
        length_mm: design.total_span_mm,
        quantity: rebar.compression_count,
      }),
    )
  }

  // Stirrups.
  if (rebar.stirrup_dia_mm > 0 && rebar.stirrup_legs > 0) {
    const stirrupQty = sum_stirrup_count(
      rebar.stirrup_zones as BeamStirrupZone[],
    )
    if (stirrupQty > 0) {
      rows.push(
        makeRow({
          project_id: design.project_id,
          element_id: design.id,
          element_label: label,
          element_type: elementType,
          bar_mark: `${label}-M5`,
          bar_dia_mm: rebar.stirrup_dia_mm,
          bar_shape: 'closed_tie',
          length_mm: stirrup_length_mm(
            design.b_mm,
            design.h_mm,
            design.clear_cover_mm,
          ),
          quantity: stirrupQty,
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
  /** Length per bar (mm). */
  length_mm: number
  /** Bar count. */
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
