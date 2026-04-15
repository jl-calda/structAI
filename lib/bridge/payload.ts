/**
 * SyncPayload — shape posted by the Python bridge to `/api/bridge/sync`.
 * See docs/13-bridge.md for the reference spec.
 *
 * All validation is structural (presence + type). Value-level sanity checks
 * belong in the engines that consume this data (e.g. x_ratio ∈ [0,1] is
 * enforced at the DB CHECK constraint, not here).
 */
import type {
  CombinationFactor,
  LoadType,
  MemberType,
  SupportType,
} from '@/lib/supabase/types'

export type SyncNode = {
  node_id: number
  x_mm: number
  y_mm: number
  z_mm: number
  support_type: SupportType
}

export type SyncMember = {
  member_id: number
  start_node_id: number
  end_node_id: number
  section_name: string
  material_name?: string | null
  length_mm: number
  beta_angle_deg?: number
  member_type: MemberType
}

export type SyncSection = {
  section_name: string
  section_type: 'rectangular' | 'i_section' | 'circular'
  b_mm?: number | null
  h_mm?: number | null
  area_mm2?: number | null
  i_major_mm4?: number | null
  i_minor_mm4?: number | null
}

export type SyncMaterial = {
  name: string
  e_mpa: number
  density_kn_m3: number
  fc_mpa?: number | null
  fy_mpa?: number | null
}

export type SyncLoadCase = {
  case_number: number
  title: string
  load_type: LoadType
}

export type SyncCombination = {
  combo_number: number
  title: string
  factors: CombinationFactor[]
  source?: 'imported' | 'app_generated'
}

export type SyncDiagramPoint = {
  member_id: number
  combo_number: number
  x_ratio: number
  x_mm: number
  mz_knm: number
  vy_kn: number
  n_kn: number
}

export type SyncEnvelope = {
  member_id: number
  mpos_max_knm: number
  mpos_combo?: number | null
  mneg_max_knm: number
  mneg_combo?: number | null
  vu_max_kn: number
  vu_combo?: number | null
  nu_tension_max_kn?: number
  nu_compression_max_kn?: number
}

export type SyncReaction = {
  node_id: number
  combo_number: number
  rx_kn: number
  ry_kn: number
  rz_kn: number
  mx_knm: number
  my_knm: number
  mz_knm: number
}

export type SyncPayload = {
  project_id: string
  file_name: string
  file_hash: string
  nodes: SyncNode[]
  members: SyncMember[]
  sections: SyncSection[]
  materials?: SyncMaterial[]
  load_cases: SyncLoadCase[]
  combinations: SyncCombination[]
  diagram_points: SyncDiagramPoint[]
  envelope: SyncEnvelope[]
  reactions: SyncReaction[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class PayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadError'
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PayloadError(message)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isArray<T>(v: unknown): v is T[] {
  return Array.isArray(v)
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isStr(v: unknown): v is string {
  return typeof v === 'string'
}

/**
 * Shallow structural validation. Returns the payload typed — does NOT coerce.
 * Throws PayloadError with a specific message on the first bad field.
 */
export function parseSyncPayload(body: unknown): SyncPayload {
  assert(isObject(body), 'payload must be an object')

  assert(isStr(body.project_id), 'project_id must be a string')
  assert(isStr(body.file_name), 'file_name must be a string')
  assert(isStr(body.file_hash), 'file_hash must be a string')

  const arrayFields = [
    'nodes',
    'members',
    'sections',
    'load_cases',
    'combinations',
    'diagram_points',
    'envelope',
    'reactions',
  ] as const
  for (const key of arrayFields) {
    assert(isArray(body[key]), `${key} must be an array`)
  }
  if (body.materials !== undefined) {
    assert(isArray(body.materials), 'materials must be an array when provided')
  }

  // Spot-check a representative item per array — cheap, catches the common
  // shape errors from an out-of-date bridge build without O(n) work.
  const nodes = body.nodes as unknown[]
  if (nodes.length > 0) {
    const n = nodes[0] as Record<string, unknown>
    assert(isNum(n.node_id) && isNum(n.x_mm) && isNum(n.y_mm) && isNum(n.z_mm),
      'nodes[0] has missing/invalid coordinates')
  }

  const diagrams = body.diagram_points as unknown[]
  if (diagrams.length > 0) {
    const d = diagrams[0] as Record<string, unknown>
    assert(
      isNum(d.member_id) && isNum(d.combo_number) &&
      isNum(d.x_ratio) && isNum(d.x_mm) &&
      isNum(d.mz_knm) && isNum(d.vy_kn),
      'diagram_points[0] has missing/invalid fields',
    )
  }

  return body as unknown as SyncPayload
}
