/**
 * Load combination generator tests.
 *
 * Verifies the template → concrete-combo expansion against two common
 * shapes: single-case (1.4D) and multi-case (1.2D + 1.6L + 0.5Lr),
 * plus warning behaviour when a load_type isn't in the STAAD model.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { generateCombinations } from '@/lib/loads/generator'

const cases = [
  { case_number: 1, title: 'DEAD', load_type: 'dead' as const },
  { case_number: 2, title: 'LIVE', load_type: 'live' as const },
  { case_number: 3, title: 'ROOF LIVE', load_type: 'roof_live' as const },
]

test('1.4D expands to a single factor on the dead case', () => {
  const tpl = [{ title: '1.4D', factors: [{ load_type: 'dead' as const, factor: 1.4 }] }]
  const { combinations, warnings } = generateCombinations(tpl, cases, 101)
  assert.strictEqual(combinations.length, 1)
  assert.strictEqual(warnings.length, 0)
  const c = combinations[0]
  assert.strictEqual(c.combo_number, 101)
  assert.strictEqual(c.factors.length, 1)
  assert.strictEqual(c.factors[0].case_number, 1)
  assert.strictEqual(c.factors[0].factor, 1.4)
})

test('1.2D + 1.6L + 0.5Lr pulls all three STAAD cases', () => {
  const tpl = [
    {
      title: '1.2D + 1.6L + 0.5Lr',
      factors: [
        { load_type: 'dead' as const, factor: 1.2 },
        { load_type: 'live' as const, factor: 1.6 },
        { load_type: 'roof_live' as const, factor: 0.5 },
      ],
    },
  ]
  const { combinations } = generateCombinations(tpl, cases, 101)
  assert.strictEqual(combinations.length, 1)
  assert.deepStrictEqual(
    combinations[0].factors.map((f) => [f.case_number, f.factor]),
    [[1, 1.2], [2, 1.6], [3, 0.5]],
  )
})

test('missing load_type skips the combo and records a warning', () => {
  const tpl = [
    {
      title: '1.2D + 1.0Wx',
      factors: [
        { load_type: 'dead' as const, factor: 1.2 },
        { load_type: 'wind_x' as const, factor: 1.0 },
      ],
    },
  ]
  const { combinations, warnings } = generateCombinations(tpl, cases, 101)
  assert.strictEqual(combinations.length, 0, 'wind-absent combo must be skipped')
  assert.strictEqual(warnings.length, 1)
  assert.match(warnings[0], /wind_x/)
})

test('multiple STAAD cases of the same load_type fan out', () => {
  const manyDeads = [
    { case_number: 1, title: 'SELF', load_type: 'dead' as const },
    { case_number: 2, title: 'SDL', load_type: 'dead' as const },
  ]
  const tpl = [{ title: '1.4D', factors: [{ load_type: 'dead' as const, factor: 1.4 }] }]
  const { combinations } = generateCombinations(tpl, manyDeads, 101)
  assert.strictEqual(combinations.length, 1)
  assert.strictEqual(combinations[0].factors.length, 2, 'both dead cases summed')
})

test('combo numbers start at startCombo and increment', () => {
  const tpl = [
    { title: '1.4D', factors: [{ load_type: 'dead' as const, factor: 1.4 }] },
    {
      title: '1.2D + 1.6L',
      factors: [
        { load_type: 'dead' as const, factor: 1.2 },
        { load_type: 'live' as const, factor: 1.6 },
      ],
    },
  ]
  const { combinations } = generateCombinations(tpl, cases, 201)
  assert.deepStrictEqual(combinations.map((c) => c.combo_number), [201, 202])
})
