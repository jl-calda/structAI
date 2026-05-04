/**
 * Synthesize M(x) and V(x) diagrams from user-entered loads for
 * standalone beam design. Produces the same BeamDiagramSample[] shape
 * that the STAAD stitching code produces so the group engine can run
 * identically regardless of data source.
 */
import type { BeamDiagramSample } from './group-engine'

export type SynthesisInput = {
  span_mm: number
  wu_kn_m?: number
  pu_mid_kn?: number
  support: 'simply_supported' | 'fixed_fixed' | 'fixed_pinned' | 'cantilever' | 'continuous'
}

const N = 11

export function synthesizeDiagram(input: SynthesisInput): BeamDiagramSample[] {
  const L = input.span_mm / 1000
  const w = input.wu_kn_m ?? 0
  const P = input.pu_mid_kn ?? 0
  const samples: BeamDiagramSample[] = []

  for (let i = 0; i < N; i++) {
    const ratio = i / (N - 1)
    const x = ratio * L
    const x_mm = ratio * input.span_mm

    let M = 0
    let V = 0

    switch (input.support) {
      case 'simply_supported':
        M = ssM(w, P, L, x)
        V = ssV(w, P, L, x)
        break
      case 'fixed_fixed':
        M = ffM(w, L, x)
        V = ffV(w, L, x)
        break
      case 'fixed_pinned':
        M = fpM(w, L, x)
        V = fpV(w, L, x)
        break
      case 'cantilever':
        M = cantM(w, P, L, x)
        V = cantV(w, P, L, x)
        break
      case 'continuous':
        M = contM(w, L, x)
        V = contV(w, L, x)
        break
    }

    samples.push({ x_mm, Mz_kNm: M, Vy_kN: V, combo_number: 0 })
  }

  return samples
}

function ssM(w: number, P: number, L: number, x: number): number {
  return w * x * (L - x) / 2 + (x <= L / 2 ? P * x / 2 : P * (L - x) / 2)
}

function ssV(w: number, P: number, L: number, x: number): number {
  const Vw = w * (L / 2 - x)
  const Vp = x < L / 2 ? P / 2 : x > L / 2 ? -P / 2 : 0
  return Vw + Vp
}

function ffM(w: number, L: number, x: number): number {
  return w * x * (L - x) / 2 - w * L * L / 12
}

function ffV(w: number, L: number, x: number): number {
  return w * (L / 2 - x)
}

function fpM(w: number, L: number, x: number): number {
  const Ra = 3 * w * L / 8
  return Ra * x - w * x * x / 2
}

function fpV(w: number, L: number, x: number): number {
  const Ra = 3 * w * L / 8
  return Ra - w * x
}

function cantM(w: number, P: number, L: number, x: number): number {
  return -(w * (L - x) * (L - x) / 2) - P * (L - x)
}

function cantV(w: number, P: number, L: number, x: number): number {
  return w * (L - x) + P
}

function contM(w: number, L: number, x: number): number {
  const Ra = w * L / 2
  const Ma_neg = -w * L * L / 12
  return Ma_neg + Ra * x - w * x * x / 2
}

function contV(w: number, L: number, x: number): number {
  return w * (L / 2 - x)
}
