import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { synthesizeDiagram } from '../diagram-synthesizer'

describe('synthesizeDiagram', () => {
  it('produces 11 samples', () => {
    const d = synthesizeDiagram({
      span_mm: 6000,
      wu_kn_m: 30,
      support: 'simply_supported',
    })
    assert.equal(d.length, 11)
  })

  it('simply supported: M peaks at midspan, V=0 at midspan', () => {
    const w = 30
    const L = 6 // metres
    const d = synthesizeDiagram({
      span_mm: 6000,
      wu_kn_m: w,
      support: 'simply_supported',
    })
    const mid = d[5]
    const expectedM = (w * L * L) / 8
    assert.ok(Math.abs(mid.Mz_kNm - expectedM) < 0.1, `M midspan=${mid.Mz_kNm}, expected ${expectedM}`)
    assert.ok(Math.abs(mid.Vy_kN) < 0.1, `V midspan=${mid.Vy_kN}, expected ~0`)
  })

  it('simply supported: V at supports = wL/2', () => {
    const w = 30
    const L = 6
    const d = synthesizeDiagram({
      span_mm: 6000,
      wu_kn_m: w,
      support: 'simply_supported',
    })
    const expectedV = (w * L) / 2
    assert.ok(Math.abs(d[0].Vy_kN - expectedV) < 0.1, `V left=${d[0].Vy_kN}, expected ${expectedV}`)
    assert.ok(Math.abs(d[10].Vy_kN + expectedV) < 0.1, `V right=${d[10].Vy_kN}, expected ${-expectedV}`)
  })

  it('simply supported: M=0 at supports', () => {
    const d = synthesizeDiagram({
      span_mm: 6000,
      wu_kn_m: 30,
      support: 'simply_supported',
    })
    assert.ok(Math.abs(d[0].Mz_kNm) < 0.01, `M left=${d[0].Mz_kNm}`)
    assert.ok(Math.abs(d[10].Mz_kNm) < 0.01, `M right=${d[10].Mz_kNm}`)
  })

  it('fixed-fixed: negative moment at supports', () => {
    const w = 30
    const L = 6
    const d = synthesizeDiagram({
      span_mm: 6000,
      wu_kn_m: w,
      support: 'fixed_fixed',
    })
    const expectedMsupport = -(w * L * L) / 12
    assert.ok(d[0].Mz_kNm < 0, `M left should be negative: ${d[0].Mz_kNm}`)
    assert.ok(
      Math.abs(d[0].Mz_kNm - expectedMsupport) < 0.1,
      `M left=${d[0].Mz_kNm}, expected ${expectedMsupport}`,
    )
  })

  it('cantilever: max negative moment at fixed end', () => {
    const w = 20
    const L = 3
    const d = synthesizeDiagram({
      span_mm: 3000,
      wu_kn_m: w,
      support: 'cantilever',
    })
    const expectedM = -(w * L * L) / 2
    assert.ok(
      Math.abs(d[0].Mz_kNm - expectedM) < 0.1,
      `M fixed end=${d[0].Mz_kNm}, expected ${expectedM}`,
    )
    assert.ok(Math.abs(d[10].Mz_kNm) < 0.1, `M free end=${d[10].Mz_kNm}, expected ~0`)
  })

  it('point load at midspan: M = PL/4', () => {
    const P = 100
    const L = 8
    const d = synthesizeDiagram({
      span_mm: 8000,
      pu_mid_kn: P,
      support: 'simply_supported',
    })
    const expectedM = (P * L) / 4
    const mid = d[5]
    assert.ok(
      Math.abs(mid.Mz_kNm - expectedM) < 0.5,
      `M midspan=${mid.Mz_kNm}, expected ${expectedM}`,
    )
  })

  it('combo_number is always 0 for synthesized diagrams', () => {
    const d = synthesizeDiagram({
      span_mm: 6000,
      wu_kn_m: 30,
      support: 'simply_supported',
    })
    for (const sample of d) {
      assert.equal(sample.combo_number, 0)
    }
  })

  it('zero loads produce zero diagram', () => {
    const d = synthesizeDiagram({
      span_mm: 6000,
      support: 'simply_supported',
    })
    for (const sample of d) {
      assert.ok(Math.abs(sample.Mz_kNm) === 0, `M should be 0: ${sample.Mz_kNm}`)
      assert.ok(Math.abs(sample.Vy_kN) === 0, `V should be 0: ${sample.Vy_kN}`)
    }
  })
})
