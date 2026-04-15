/**
 * Unit tests for the flexure physics.
 *
 * Textbook benchmark (MacGregor/Wight, 6th ed., Ex. 4-3):
 *   b = 250 mm, d = 430 mm, fc = 28 MPa, fy = 420 MPa, As = 1530 mm² (3#25).
 *   Expected: a ≈ 108 mm, phi_Mn ≈ 218 kN·m.
 *
 * Run: `node --test --loader tsx` once tsx is wired, or via the full
 * project test runner when added. For now these are hand-runnable:
 *   npx tsx --test lib/engineering/concrete/beam/__tests__/flexure.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { ACI_318_19 } from '@/lib/engineering/codes/aci318-19'
import {
  As_required_singly,
  design_flexure,
  phi_Mn_max_singly,
} from '@/lib/engineering/concrete/beam/flexure'

const geom = {
  b_mm: 250,
  h_mm: 500,
  d_mm: 430,
  clear_cover_mm: 40,
}
const mat = { fc_mpa: 28, fy_mpa: 420, fys_mpa: 420 }

test('moment_capacity matches MacGregor Ex. 4-3 within 5%', () => {
  const cap = ACI_318_19.moment_capacity(1530, 0, geom, mat)
  // Expected around 218 kN·m (phi·Mn with phi=0.9).
  assert.ok(
    cap.phi_Mn_kNm > 207 && cap.phi_Mn_kNm < 229,
    `phi_Mn_kNm out of band: got ${cap.phi_Mn_kNm.toFixed(1)}`,
  )
  // Stress block depth near 108 mm.
  assert.ok(cap.a_mm > 100 && cap.a_mm < 115, `a_mm out of band: ${cap.a_mm}`)
})

test('As_required_singly is consistent with moment_capacity', () => {
  const cap = ACI_318_19.moment_capacity(1530, 0, geom, mat)
  const As = As_required_singly(cap.phi_Mn_kNm, geom, mat, ACI_318_19)
  // Round-trip tolerance: within 2%.
  assert.ok(
    Math.abs(As - 1530) / 1530 < 0.02,
    `round-trip As off: got ${As.toFixed(0)}, expected ~1530`,
  )
})

test('phi_Mn_max_singly is the tension-controlled ceiling', () => {
  const cap = phi_Mn_max_singly(geom, mat, ACI_318_19)
  // At eps_t = 0.005, c/d = 0.375, a_max = 0.85 · 0.375 · 430 = 137 mm.
  assert.ok(
    cap.a_max_mm > 130 && cap.a_max_mm < 145,
    `a_max_mm out of band: ${cap.a_max_mm}`,
  )
  // A section with As > As_max would trigger doubly reinforced.
  const result = design_flexure(cap.phi_Mn_kNm * 1.3, geom, mat, ACI_318_19)
  assert.ok(
    result.is_doubly_reinforced,
    'design_flexure should flag doubly reinforced when Mu exceeds the singly ceiling',
  )
  assert.ok(
    result.As_prime_mm2 > 0,
    'compression steel area should be positive when doubly reinforced',
  )
})

test('zero Mu returns zero steel', () => {
  const result = design_flexure(0, geom, mat, ACI_318_19)
  assert.strictEqual(result.As_mm2, 0)
  assert.strictEqual(result.As_prime_mm2, 0)
  assert.strictEqual(result.is_doubly_reinforced, false)
})
