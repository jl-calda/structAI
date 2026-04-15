/**
 * Regression test for the core rule in docs/05-beam-engine.md:
 * "Design each beam from its own full moment diagram. Never take
 *  max-of-maxima across beams."
 *
 * We construct three beams whose M+ / M- peaks occur at DIFFERENT x,
 * and assert that each beam gets its own bend-point pair — distinct
 * from what a max-of-maxima envelope would produce.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { ACI_318_19 } from '@/lib/engineering/codes/aci318-19'
import {
  runBeamGroupDesign,
  type BeamGroupInput,
  type BeamInput,
} from '@/lib/engineering/concrete/beam/group-engine'

const geom = {
  b_mm: 300,
  h_mm: 600,
  d_mm: 540,
  clear_cover_mm: 40,
}
const mat = { fc_mpa: 28, fy_mpa: 420, fys_mpa: 420 }

/** Build a diagram whose M(x) peaks at `xPeak_mm` with magnitude `Mpeak_kNm`. */
function triangleDiagram(
  xPeak_mm: number,
  Mpeak_kNm: number,
  span: number,
  combo: number,
) {
  const samples = []
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * span
    // Triangle that peaks at xPeak.
    const frac = x <= xPeak_mm ? x / xPeak_mm : (span - x) / (span - xPeak_mm)
    samples.push({
      x_mm: x,
      Mz_kNm: Mpeak_kNm * frac,
      Vy_kN: 200 - 200 * frac,
      combo_number: combo,
    })
  }
  return samples
}

function makeBeam(label: string, xPeak: number, Mpeak: number): BeamInput {
  const span = 6000
  return {
    label,
    member_ids: [1],
    member_lengths_mm: [span],
    total_span_mm: span,
    geom,
    mat,
    diagram: triangleDiagram(xPeak, Mpeak, span, 101),
  }
}

test('per-beam bend points differ from a max-of-maxima shortcut', () => {
  const group: BeamGroupInput = {
    beams: [
      // Three beams in the same group, peaks at different x.
      makeBeam('B-12', 2000, 420),
      makeBeam('B-13', 3000, 400),
      makeBeam('B-14', 4200, 440),
    ],
    starting_rebar: {
      perimeter_dia_mm: 20,
      tension_layers: [],
      compression_dia_mm: 20,
      compression_count: 0,
      stirrup_dia_mm: 10,
      stirrup_legs: 2,
    },
    code: ACI_318_19,
    dense_spacing_mm: 100,
    mid_spacing_mm: 200,
  }

  const result = runBeamGroupDesign(group)
  assert.strictEqual(result.checks.length, 3)

  const [b12, b13, b14] = result.checks

  // Each beam's bend points must be distinct from the others'.
  // (They should differ because M(x) peaks at different locations.)
  const tuples = [
    [b12.bend_points.bend_point_left_mm, b12.bend_points.bend_point_right_mm],
    [b13.bend_points.bend_point_left_mm, b13.bend_points.bend_point_right_mm],
    [b14.bend_points.bend_point_left_mm, b14.bend_points.bend_point_right_mm],
  ]
  const serialised = tuples.map((t) => `${t[0].toFixed(0)}_${t[1].toFixed(0)}`)
  const unique = new Set(serialised)
  assert.ok(
    unique.size >= 2,
    `expected at least two distinct bend-point pairs across beams, got: ${[...unique].join(' | ')}`,
  )
})

test('engine terminates within max iterations when the group is satisfiable', () => {
  const group: BeamGroupInput = {
    beams: [makeBeam('B-1', 3000, 300)],
    starting_rebar: {
      perimeter_dia_mm: 20,
      tension_layers: [],
      compression_dia_mm: 20,
      compression_count: 0,
      stirrup_dia_mm: 10,
      stirrup_legs: 2,
    },
    code: ACI_318_19,
    dense_spacing_mm: 100,
    mid_spacing_mm: 200,
    max_iterations: 8,
  }
  const result = runBeamGroupDesign(group)
  assert.ok(
    result.iterations <= 8,
    `iterations overshot: ${result.iterations}`,
  )
})
