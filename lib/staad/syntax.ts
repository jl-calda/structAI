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
  floorLoads?: FloorLoad[]
  selfWeight?: { factor: number }
}

export type FloorLoad = {
  /** 'yrange' = by floor Y level, 'members' = by member list */
  method: 'yrange' | 'members'
  /** Y coordinate of the floor (m) — used when method='yrange' */
  yLevel?: number
  /** STAAD member IDs — used when method='members' */
  memberIds?: number[]
  /** Pressure in kN/m² (positive value — the generator adds the minus sign) */
  pressure_kpa: number
  /** Load distribution: two-way (default) or one-way in X/Z */
  distribution: 'twoway' | 'oneway_x' | 'oneway_z'
}

export type ComboInput = {
  comboNumber: number
  title: string
  factors: { caseNumber: number; factor: number }[]
}

// ---------------------------------------------------------------------------
// Wind definition
// ---------------------------------------------------------------------------

export type WindDefinition = {
  typeNumber: number
  typeName: string
  pressures: number[]
  heights: number[]
}

export function generateWindDefinition(wind: WindDefinition): string {
  const lines: string[] = ['DEFINE WIND LOAD']
  lines.push(`TYPE ${wind.typeNumber} ${wind.typeName}`)
  const intStr = wind.pressures.map(p => p.toFixed(3)).join(' ')
  const heigStr = wind.heights.map(h => h.toFixed(1)).join(' ')
  lines.push(`INT ${intStr} HEIG ${heigStr}`)
  return lines.join('\n')
}

export type WindLoadCase = {
  caseNumber: number
  title: string
  direction: 'X' | 'Z'
  factor: 1 | -1
  typeNumber: number
  xRange: [number, number]
  yRange: [number, number]
  zRange: [number, number]
}

export function generateWindLoadCase(wlc: WindLoadCase): string {
  const lines: string[] = []
  lines.push(`LOAD ${wlc.caseNumber} LOADTYPE Wind  TITLE ${wlc.title}`)
  lines.push(`WIND LOAD ${wlc.direction} ${wlc.factor} TYPE ${wlc.typeNumber} XR ${wlc.xRange[0]} ${wlc.xRange[1]} YR ${wlc.yRange[0]} ${wlc.yRange[1]} ZR ${wlc.zRange[0]} ${wlc.zRange[1]}`)
  return lines.join('\n')
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
// Reference Loads — reusable load patterns referenced by primary cases and seismic mass
// ---------------------------------------------------------------------------

export type ReferenceLoadDef = {
  id: string
  loadType: string
  title: string
  selfWeight?: { factor: number }
  memberLoads?: MemberLoad[]
  floorLoads?: FloorLoad[]
}

export function generateReferenceLoadsBlock(refs: ReferenceLoadDef[]): string {
  if (refs.length === 0) return ''
  const lines: string[] = ['DEFINE REFERENCE LOADS']

  for (const ref of refs) {
    lines.push(`LOAD ${ref.id} LOADTYPE ${ref.loadType}  TITLE ${ref.title}`)

    if (ref.selfWeight) {
      lines.push(`SELFWEIGHT Y -${ref.selfWeight.factor}`)
    }

    if (ref.memberLoads && ref.memberLoads.length > 0) {
      lines.push('MEMBER LOAD')
      for (const ml of ref.memberLoads) {
        if (ml.type === 'UNI') {
          const w = ml.w < 0 ? ml.w : -ml.w
          lines.push(`${ml.memberId} UNI ${ml.dir} ${w}`)
        } else if (ml.type === 'CON') {
          const p = ml.p < 0 ? ml.p : -ml.p
          lines.push(`${ml.memberId} CON ${ml.dir} ${p} ${ml.d}`)
        }
      }
    }

    if (ref.floorLoads && ref.floorLoads.length > 0) {
      lines.push('FLOOR LOAD')
      for (const fl of ref.floorLoads) {
        const p = -(Math.abs(fl.pressure_kpa))
        const oneWay = fl.distribution === 'oneway_x' ? ' ONEWAY X' : fl.distribution === 'oneway_z' ? ' ONEWAY Z' : ''
        if (fl.method === 'yrange' && fl.yLevel != null) {
          lines.push(`YRANGE ${fl.yLevel.toFixed(3)} ${fl.yLevel.toFixed(3)} FLOAD ${p} GY${oneWay}`)
        } else if (fl.method === 'members' && fl.memberIds && fl.memberIds.length > 0) {
          lines.push(`${fl.memberIds.join(' ')} FLOAD ${p} GY${oneWay}`)
        }
      }
    }
  }

  lines.push('END DEFINE REFERENCE LOADS')
  return lines.join('\n')
}

/**
 * Generate a primary load case that references an R-load instead of
 * defining its own member loads.
 */
export function generateRefLoadCase(
  caseNumber: number,
  loadType: string,
  title: string,
  refId: string,
  factor = 1.0,
): string {
  return [
    `LOAD ${caseNumber} LOADTYPE ${loadType}  TITLE ${title}`,
    'REFERENCE LOAD',
    `${refId} ${factor}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Primary load case block
// ---------------------------------------------------------------------------

export function generateLoadCaseBlock(lc: LoadCaseInput): string {
  const lines: string[] = []

  lines.push(`LOAD ${lc.caseNumber} LOADTYPE ${lc.loadType} TITLE ${lc.title}`)

  // SELFWEIGHT — factor-based, applies to all members
  if (lc.selfWeight) {
    lines.push(`SELFWEIGHT Y -${lc.selfWeight.factor}`)
  }

  // MEMBER LOAD — UDL, point, trapezoidal on specific members
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

  // FLOOR LOAD — STAAD distributes to beams automatically
  if (lc.floorLoads && lc.floorLoads.length > 0) {
    lines.push('FLOOR LOAD')
    for (const fl of lc.floorLoads) {
      const p = -(Math.abs(fl.pressure_kpa))
      const oneWay = fl.distribution === 'oneway_x' ? ' ONEWAY X' : fl.distribution === 'oneway_z' ? ' ONEWAY Z' : ''
      if (fl.method === 'yrange' && fl.yLevel != null) {
        lines.push(`YRANGE ${fl.yLevel.toFixed(3)} ${fl.yLevel.toFixed(3)} FLOAD ${p} GY${oneWay}`)
      } else if (fl.method === 'members' && fl.memberIds && fl.memberIds.length > 0) {
        const memberStr = fl.memberIds.join(' ')
        lines.push(`${memberStr} FLOAD ${p} GY${oneWay}`)
      }
    }
  }

  // JOINT LOAD — concentrated forces at nodes
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

// ---------------------------------------------------------------------------
// Seismic definition block (DEFINE UBC LOAD / DEFINE IBC 2006 LOAD)
// ---------------------------------------------------------------------------

export type SeismicRefLoad = { caseNumber: number; factor: number }

/** Named reference load for seismic mass (e.g. R1 1.0, R2 0.2) */
export type SeismicRefLoadNamed = { refId: string; factor: number }

export type SeismicDefinition = {
  code: 'UBC_1997' | 'IBC_2006'
  zone?: number
  importance: number
  rwx: number
  rwz: number
  soilType: number
  /** Near-source acceleration factor (Na). Default 1.0 if ≥10km from fault. */
  na?: number
  /** Near-source velocity factor (Nv). Default 1.0 if ≥10km from fault. */
  nv?: number
  sds?: number
  sd1?: number
  s1?: number
  sclass?: number
  ct?: number
  /** Legacy: reference by primary case number */
  referenceLoads: SeismicRefLoad[]
  /** Preferred: reference by R-load name (R1, R2, etc.) */
  namedRefs?: SeismicRefLoadNamed[]
}

export function generateSeismicDefinition(def: SeismicDefinition): string {
  const lines: string[] = []

  if (def.code === 'UBC_1997') {
    lines.push('DEFINE UBC LOAD')
    const naStr = def.na != null ? ` NA ${def.na}` : ''
    const nvStr = def.nv != null ? ` NV ${def.nv}` : ''
    lines.push(`ZONE ${def.zone ?? 0.4} I ${def.importance} RWX ${def.rwx} RWZ ${def.rwz} STYP ${def.soilType}${naStr}${nvStr}`)
  } else {
    lines.push('DEFINE IBC 2006 LOAD')
    lines.push(`SDS ${def.sds ?? 1.0} SD1 ${def.sd1 ?? 0.6} S1 ${def.s1 ?? 0.4} IE ${def.importance}`)
    lines.push(`RX ${def.rwx} RZ ${def.rwz} SCLASS ${def.sclass ?? 4} CT ${def.ct ?? 0.016}`)
  }

  // Prefer named R-load references (R1 1.0 R2 0.2) over legacy case-number references
  if (def.namedRefs && def.namedRefs.length > 0) {
    lines.push('REFERENCE LOAD Y')
    const parts = def.namedRefs.map(r => `${r.refId} ${r.factor}`).join(' ')
    lines.push(parts)
  } else if (def.referenceLoads.length > 0) {
    lines.push('REFERENCE LOAD')
    const parts = def.referenceLoads.map(r => `${r.caseNumber} ${r.factor}`).join(' ')
    lines.push(`R ${parts}`)
  }

  return lines.join('\n')
}

export function generateSeismicLoadCase(
  caseNumber: number,
  title: string,
  direction: 'X' | 'Z',
  codeKeyword: 'UBC' | 'IBC' = 'UBC',
  factor = 1.0,
): string {
  const lines: string[] = []
  lines.push(`LOAD ${caseNumber} LOADTYPE Seismic TITLE ${title}`)
  lines.push(`${codeKeyword} LOAD ${direction} ${factor}`)
  return lines.join('\n')
}

export function generateFullSeismicBlock(
  def: SeismicDefinition,
  eqxCase: number,
  eqzCase: number,
): string {
  const keyword = def.code === 'UBC_1997' ? 'UBC' : 'IBC'
  return [
    generateSeismicDefinition(def),
    '',
    generateSeismicLoadCase(eqxCase, 'Eqx', 'X', keyword),
    '',
    generateSeismicLoadCase(eqzCase, 'Eqz', 'Z', keyword),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// NSCP 2015 full combo matrix (25 ultimate + 12 allowable)
// ---------------------------------------------------------------------------

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
