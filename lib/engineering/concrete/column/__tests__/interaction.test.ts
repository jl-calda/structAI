/**
 * Column P-M interaction curve tests.
 *
 * Sanity checks against well-known limit states:
 *   1. Pure compression (c → ∞) gives phi_Pn near Pn_max cap, zero Mn.
 *   2. Pure bending (c → 0) gives positive Mn, small negative Pn
 *      (tension-controlled — steel yields, concrete contributes nothing).
 *   3. Interaction ratio = 0 at origin, 1.0 exactly on the curve, > 1
 *      outside the curve.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { ACI_318_19 } from '@/lib/engineering/codes/aci318-19'
import {
  buildPmCurve,
  interactionRatio,
} from '@/lib/engineering/concrete/column/interaction'

const section = {
  b_mm: 400,
  h_mm: 400,
  d_prime_mm: 60, // 40 cover + 10 tie + 20/2 bar
}
const mat = { fc_mpa: 28, fy_mpa: 420, fys_mpa: 420 }
const rebar = { bar_count: 8, bar_dia_mm: 20, type: 'tied' as const }

test('curve has a pure-compression nose with Mn near zero', () => {
  const curve = buildPmCurve(section, rebar, mat, ACI_318_19)
  const nose = curve[0]
  assert.ok(nose.phi_Pn_kN > 1500, `expected φPn nose ≳ 1500 kN, got ${nose.phi_Pn_kN}`)
  assert.ok(nose.phi_Mn_kNm < 5, `pure compression Mn should be ~0, got ${nose.phi_Mn_kNm}`)
})

test('curve has a tension-governed tail with Pn negative and Mn > 0', () => {
  const curve = buildPmCurve(section, rebar, mat, ACI_318_19)
  const tail = curve[curve.length - 1]
  assert.ok(tail.phi_Pn_kN < 0, `tail Pn should be negative (pure tension), got ${tail.phi_Pn_kN}`)
  // Tail itself is the pure-tension point (Mn = 0); adjacent point should
  // have positive Mn in the balanced region.
  const midRatio = curve[Math.floor(curve.length / 2)]
  assert.ok(midRatio.phi_Mn_kNm > 0, 'mid-curve Mn should be positive')
})

test('interaction ratio is <1 inside, ~1 on the curve, >1 outside', () => {
  const curve = buildPmCurve(section, rebar, mat, ACI_318_19)
  // Pick a point clearly inside (half the balanced M at half the nose Pn).
  const balanced = curve[Math.floor(curve.length / 2)]
  const insideRatio = interactionRatio(
    curve,
    balanced.phi_Pn_kN * 0.5,
    balanced.phi_Mn_kNm * 0.5,
  )
  assert.ok(insideRatio < 1, `inside point should give ratio < 1, got ${insideRatio}`)

  const onCurveRatio = interactionRatio(
    curve,
    balanced.phi_Pn_kN,
    balanced.phi_Mn_kNm,
  )
  assert.ok(
    Math.abs(onCurveRatio - 1) < 0.08,
    `on-curve ratio should be ~1, got ${onCurveRatio}`,
  )

  const outsideRatio = interactionRatio(
    curve,
    balanced.phi_Pn_kN * 1.5,
    balanced.phi_Mn_kNm * 1.5,
  )
  assert.ok(outsideRatio > 1, `outside point should give ratio > 1, got ${outsideRatio}`)
})

test('more steel raises capacity (monotonic in bar_count)', () => {
  const low = buildPmCurve(section, { ...rebar, bar_count: 4 }, mat, ACI_318_19)
  const high = buildPmCurve(section, { ...rebar, bar_count: 12 }, mat, ACI_318_19)
  assert.ok(
    high[0].phi_Pn_kN > low[0].phi_Pn_kN,
    `12-bar section should have higher φPn_max than 4-bar (got ${high[0].phi_Pn_kN} vs ${low[0].phi_Pn_kN})`,
  )
})
