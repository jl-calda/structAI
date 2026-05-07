/**
 * STAAD Pro syntax generators — produce copy-pasteable command strings
 * for primary load cases (LOAD N LOADTYPE X TITLE Y + member/joint loads)
 * and combination blocks (REPEAT LOAD + PERFORM ANALYSIS + CHANGE).
 *
 * These are pure string functions — no DB, no side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemberLoad =
  | { memberId: number; type: 'UNI'; dir: 'GY'; w: number; d1?: number; d2?: number }
  | { memberId: number; type: 'CON'; dir: 'GY'; p: number; d: number }
  | { memberId: number; type: 'LIN'; dir: 'GY'; w1: number; w2: number; d1?: number; d2?: number }

export type JointLoad = {
  nodeId: number
  dir: 'FX' | 'FY' | 'FZ'
  value: number
}

export type LoadCaseInput = {
  caseNumber: number
  loadType: string
  title: string
  memberLoads?: MemberLoad[]
  jointLoads?: JointLoad[]
}

export type ComboInput = {
  comboNumber: number
  title: string
  factors: { caseNumber: number; factor: number }[]
}

// ---------------------------------------------------------------------------
// STAAD LOADTYPE keyword mapping
// ---------------------------------------------------------------------------

const STAAD_LOADTYPE: Record<string, string> = {
  dead: 'Dead',
  live: 'Live',
  roof_live: 'Roof Live',
  wind_x: 'Wind',
  wind_z: 'Wind',
  seismic_x: 'Seismic',
  seismic_z: 'Seismic',
  other: 'None',
}

export function staadLoadType(loadType: string): string {
  return STAAD_LOADTYPE[loadType] ?? 'None'
}

// ---------------------------------------------------------------------------
// Primary load case block
// ---------------------------------------------------------------------------

export function generateLoadCaseBlock(lc: LoadCaseInput): string {
  const lines: string[] = []

  lines.push(`LOAD ${lc.caseNumber} LOADTYPE ${lc.loadType} TITLE ${lc.title}`)

  if (lc.memberLoads && lc.memberLoads.length > 0) {
    lines.push('MEMBER LOAD')
    for (const ml of lc.memberLoads) {
      if (ml.type === 'UNI') {
        const w = ml.w < 0 ? ml.w : -ml.w
        if (ml.d1 != null && ml.d2 != null) {
          lines.push(`${ml.memberId} UNI ${ml.dir} ${w} ${ml.d1} ${ml.d2}`)
        } else {
          lines.push(`${ml.memberId} UNI ${ml.dir} ${w}`)
        }
      } else if (ml.type === 'CON') {
        const p = ml.p < 0 ? ml.p : -ml.p
        lines.push(`${ml.memberId} CON ${ml.dir} ${p} ${ml.d}`)
      } else if (ml.type === 'LIN') {
        const w1 = ml.w1 < 0 ? ml.w1 : -ml.w1
        const w2 = ml.w2 < 0 ? ml.w2 : -ml.w2
        if (ml.d1 != null && ml.d2 != null) {
          lines.push(`${ml.memberId} LIN ${ml.dir} ${w1} ${w2} ${ml.d1} ${ml.d2}`)
        } else {
          lines.push(`${ml.memberId} LIN ${ml.dir} ${w1} ${w2}`)
        }
      }
    }
  }

  if (lc.jointLoads && lc.jointLoads.length > 0) {
    lines.push('JOINT LOAD')
    for (const jl of lc.jointLoads) {
      lines.push(`${jl.nodeId} ${jl.dir} ${jl.value}`)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Load declaration only (no member/joint loads)
// ---------------------------------------------------------------------------

export function generateLoadDeclaration(
  caseNumber: number,
  loadType: string,
  title: string,
): string {
  return `LOAD ${caseNumber} LOADTYPE ${staadLoadType(loadType)} TITLE ${title}`
}

// ---------------------------------------------------------------------------
// Combination block (REPEAT LOAD + PERFORM ANALYSIS + CHANGE)
// ---------------------------------------------------------------------------

export function generateCombinationBlock(combo: ComboInput): string {
  const lines: string[] = []

  lines.push(`LOAD  ${combo.comboNumber} LOADTYPE None TITLE ${combo.title}`)
  lines.push('REPEAT LOAD')

  const factorParts = combo.factors
    .map(f => ` ${f.caseNumber} ${f.factor}`)
    .join('')
  lines.push(factorParts)

  lines.push('PERFORM ANALYSIS')
  lines.push('CHANGE')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// All combinations at once
// ---------------------------------------------------------------------------

export function generateAllCombinations(combos: ComboInput[]): string {
  return combos.map(c => generateCombinationBlock(c)).join('\n')
}

// ---------------------------------------------------------------------------
// Full primary load case section (all 9 cases)
// ---------------------------------------------------------------------------

export function generateAllPrimaryLoadCases(
  cases: { caseNumber: number; loadType: string; title: string }[],
): string {
  const header = '*****PRIMARY LOAD CASES*****'
  const blocks = cases.map(c =>
    generateLoadDeclaration(c.caseNumber, c.loadType, c.title),
  )
  return [header, ...blocks].join('\n')
}

// ---------------------------------------------------------------------------
// NSCP 2015 full combo matrix (25 ultimate + 12 allowable)
// ---------------------------------------------------------------------------

type CaseMap = Record<string, number>

export function buildNSCPUltimateCombos(cm: CaseMap, rho = 1): ComboInput[] {
  const eqx = cm.seismic_x ?? 0
  const eqz = cm.seismic_z ?? 0
  const dl = cm.dead ?? 0
  const ll = cm.live ?? 0
  const lr = cm.roof_live ?? 0
  const wx1 = cm.wind_x ?? 0
  const wx2 = cm.wind_x2 ?? wx1
  const wz1 = cm.wind_z ?? 0
  const wz2 = cm.wind_z2 ?? wz1

  const f = (cn: number, factor: number) => ({ caseNumber: cn, factor })
  const rhoD = +(1.2 / rho).toFixed(3)
  const rhoR = +(0.9 - 0.2 * (rho === 1 ? 0 : 0)).toFixed(3)
  void rhoR

  const combos: ComboInput[] = [
    { comboNumber: 100, title: '1.4DL', factors: [f(dl, 1.4)] },
    { comboNumber: 101, title: '1.2DL+1.6LL+0.5LR', factors: [f(dl, 1.2), f(ll, 1.6), f(lr, 0.5)] },
    { comboNumber: 102, title: '1.2DL+0.5LL+1.6LR', factors: [f(dl, 1.2), f(ll, 0.5), f(lr, 1.6)] },
    { comboNumber: 103, title: '1.2DL+1.6LR+0.5Wx_1', factors: [f(dl, 1.2), f(lr, 1.6), f(wx1, 0.5)] },
    { comboNumber: 104, title: '1.2DL+1.6LR+0.5Wx_2', factors: [f(dl, 1.2), f(lr, 1.6), f(wx2, 0.5)] },
    { comboNumber: 105, title: '1.2DL+1.6LR+0.5Wz_1', factors: [f(dl, 1.2), f(lr, 1.6), f(wz1, 0.5)] },
    { comboNumber: 106, title: '1.2DL+1.6LR+0.5Wz_2', factors: [f(dl, 1.2), f(lr, 1.6), f(wz2, 0.5)] },
    { comboNumber: 107, title: '1.2DL+0.5LL+0.5LR+1Wx_1', factors: [f(dl, 1.2), f(ll, 0.5), f(lr, 0.5), f(wx1, 1.0)] },
    { comboNumber: 108, title: '1.2DL+0.5LL+0.5LR+1Wx_2', factors: [f(dl, 1.2), f(ll, 0.5), f(lr, 0.5), f(wx2, 1.0)] },
    { comboNumber: 109, title: '1.2DL+0.5LL+0.5LR+1Wz_1', factors: [f(dl, 1.2), f(ll, 0.5), f(lr, 0.5), f(wz1, 1.0)] },
    { comboNumber: 110, title: '1.2DL+0.5LL+0.5LR+1Wz_2', factors: [f(dl, 1.2), f(ll, 0.5), f(lr, 0.5), f(wz2, 1.0)] },
    { comboNumber: 111, title: '1Eqx+1.42DL+0.5LL', factors: [f(eqx, 1), f(dl, rhoD), f(ll, 0.5)] },
    { comboNumber: 112, title: '1Eqz+1.42DL+0.5LL', factors: [f(eqz, 1), f(dl, rhoD), f(ll, 0.5)] },
    { comboNumber: 113, title: '-1Eqx+1.42DL+0.5LL', factors: [f(eqx, -1), f(dl, rhoD), f(ll, 0.5)] },
    { comboNumber: 114, title: '-1Eqz+1.42DL+0.5LL', factors: [f(eqz, -1), f(dl, rhoD), f(ll, 0.5)] },
    { comboNumber: 115, title: '0.9DL+1Wx_1', factors: [f(dl, 0.9), f(wx1, 1.0)] },
    { comboNumber: 116, title: '0.9DL+1Wx_2', factors: [f(dl, 0.9), f(wx2, 1.0)] },
    { comboNumber: 117, title: '0.9DL+1Wz_1', factors: [f(dl, 0.9), f(wz1, 1.0)] },
    { comboNumber: 118, title: '0.9DL+1Wz_2', factors: [f(dl, 0.9), f(wz2, 1.0)] },
    { comboNumber: 119, title: '1Eqx+1.12DL', factors: [f(eqx, 1), f(dl, 1.12)] },
    { comboNumber: 120, title: '1Eqz+1.12DL', factors: [f(eqz, 1), f(dl, 1.12)] },
    { comboNumber: 121, title: '-1Eqx+1.12DL', factors: [f(eqx, -1), f(dl, 1.12)] },
    { comboNumber: 122, title: '-1Eqz+1.12DL', factors: [f(eqz, -1), f(dl, 1.12)] },
    { comboNumber: 123, title: '-1Eqx+0.68DL', factors: [f(eqx, -1), f(dl, 0.68)] },
    { comboNumber: 124, title: '-1Eqz+0.68DL', factors: [f(eqz, -1), f(dl, 0.68)] },
  ]

  return combos.filter(c => c.factors.every(ff => ff.caseNumber > 0))
}

export function buildNSCPAllowableCombos(cm: CaseMap): ComboInput[] {
  const eqx = cm.seismic_x ?? 0
  const eqz = cm.seismic_z ?? 0
  const dl = cm.dead ?? 0
  const ll = cm.live ?? 0
  const lr = cm.roof_live ?? 0
  const wx1 = cm.wind_x ?? 0
  const wx2 = cm.wind_x2 ?? wx1
  const wz1 = cm.wind_z ?? 0
  const wz2 = cm.wind_z2 ?? wz1

  const f = (cn: number, factor: number) => ({ caseNumber: cn, factor })

  const combos: ComboInput[] = [
    { comboNumber: 200, title: '1DL', factors: [f(dl, 1.0)] },
    { comboNumber: 201, title: '1DL+1LL', factors: [f(dl, 1.0), f(ll, 1.0)] },
    { comboNumber: 202, title: '1DL+1LR', factors: [f(dl, 1.0), f(lr, 1.0)] },
    { comboNumber: 203, title: '1DL+0.75LL+0.75LR', factors: [f(dl, 1.0), f(ll, 0.75), f(lr, 0.75)] },
    { comboNumber: 204, title: '1DL+0.6Wx_1', factors: [f(dl, 1.0), f(wx1, 0.6)] },
    { comboNumber: 205, title: '1DL+0.6Wx_2', factors: [f(dl, 1.0), f(wx2, 0.6)] },
    { comboNumber: 206, title: '1DL+0.6Wz_1', factors: [f(dl, 1.0), f(wz1, 0.6)] },
    { comboNumber: 207, title: '1DL+0.6Wz_2', factors: [f(dl, 1.0), f(wz2, 0.6)] },
    { comboNumber: 208, title: '0.714Eqx+1DL', factors: [f(eqx, 0.714), f(dl, 1.0)] },
    { comboNumber: 209, title: '0.714Eqz+1DL', factors: [f(eqz, 0.714), f(dl, 1.0)] },
    { comboNumber: 210, title: '-0.714Eqx+1DL', factors: [f(eqx, -0.714), f(dl, 1.0)] },
    { comboNumber: 211, title: '-0.714Eqz+1DL', factors: [f(eqz, -0.714), f(dl, 1.0)] },
  ]

  return combos.filter(c => c.factors.every(ff => ff.caseNumber > 0))
}
