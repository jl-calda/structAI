/**
 * Load-combination generator.
 *
 * Given a `load_templates` row (the abstract combo pattern, e.g. "1.2D +
 * 1.6L + 0.5Lr") and the STAAD load cases already synced for a project
 * (each tagged with a `load_type`), produce concrete `staad_combinations`
 * rows with resolved `case_number` factors.
 *
 * Rules:
 * - Every template factor references a `load_type`. Resolution pulls all
 *   STAAD cases sharing that type and expands them as parallel factor
 *   entries (e.g. if there are two dead-load cases, both are included
 *   with the same factor — STAAD sums them).
 * - Templates whose factors reference a load_type absent from the STAAD
 *   model are recorded in `warnings` and their row is skipped. This is
 *   intentional: a combo missing its wind case is not a valid combo.
 * - Output combo_numbers start at `startCombo` (default 101) to avoid
 *   clashing with imported STAAD combinations, which typically use
 *   smaller numbers.
 *
 * See docs/03-schema.md `staad_combinations` and docs/11-build-phases.md
 * Phase 2.
 */
import type {
  CombinationFactor,
  LoadTemplateEntry,
  LoadType,
} from '@/lib/supabase/types'

export type StaadCaseLite = {
  case_number: number
  title: string
  load_type: LoadType
}

export type GeneratedCombination = {
  combo_number: number
  title: string
  factors: CombinationFactor[]
  source: 'app_generated'
}

export type GenerationResult = {
  combinations: GeneratedCombination[]
  warnings: string[]
}

export function generateCombinations(
  template: LoadTemplateEntry[],
  cases: StaadCaseLite[],
  startCombo = 101,
): GenerationResult {
  const casesByType = new Map<LoadType, StaadCaseLite[]>()
  for (const c of cases) {
    const bucket = casesByType.get(c.load_type) ?? []
    bucket.push(c)
    casesByType.set(c.load_type, bucket)
  }

  const combinations: GeneratedCombination[] = []
  const warnings: string[] = []
  let comboNumber = startCombo

  for (const entry of template) {
    const resolved: CombinationFactor[] = []
    let missing = false

    for (const f of entry.factors) {
      const matched = casesByType.get(f.load_type) ?? []
      if (matched.length === 0) {
        warnings.push(
          `"${entry.title}" skipped — no STAAD load case tagged ${f.load_type}.`,
        )
        missing = true
        break
      }
      for (const c of matched) {
        resolved.push({
          case_number: c.case_number,
          load_type: f.load_type,
          factor: f.factor,
        })
      }
    }

    if (missing || resolved.length === 0) continue

    combinations.push({
      combo_number: comboNumber++,
      title: entry.title,
      factors: resolved,
      source: 'app_generated',
    })
  }

  return { combinations, warnings }
}
