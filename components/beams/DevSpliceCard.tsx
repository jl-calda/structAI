'use client'

import { useState } from 'react'

import { BarBendDiagram } from './BarBendDiagram'

/**
 * Development Length & Splicing — ACI 318-19 §25.4 / NSCP 2015 §425.
 * Computes per-bar ld, ldh, ldc, ls (tens) and ls (comp) with selectable
 * modifiers (ψt top-bar, ψe coating, ψr hook confinement, splice class,
 * % spliced). Renders the bar-bending plan with column joints.
 */

export type DevSpliceCardProps = {
  fc: number
  fy: number
  cover: number
  b: number
  h: number
  span: number
  perimDia: number
  t1Count?: number
  t1Dia: number
  t2Count?: number
  t2Dia?: number
  c1Count?: number
  c1Dia: number
  c2Count?: number
  c2Dia?: number
  t1Bent: ('none' | 'both')[]
  t2Bent?: ('none' | 'both')[]
  bendL: number
}

export function DevSpliceCard({
  fc,
  fy,
  cover,
  b,
  h,
  span,
  perimDia,
  t1Count = 0,
  t1Dia,
  t2Count = 0,
  t2Dia = 0,
  c1Count = 0,
  c1Dia,
  c2Count = 0,
  c2Dia = 0,
  t1Bent,
  t2Bent = [],
  bendL,
}: DevSpliceCardProps) {
  const [topBar, setTopBar] = useState(false)
  const [epoxy, setEpoxy] = useState(false)
  const [hookSide, setHookSide] = useState<'confined' | 'unconfined'>('confined')
  const [spliceClass, setSpliceClass] = useState<'A' | 'B'>('B')
  const [pctSpliced, setPctSpliced] = useState(100)

  const lambda = 1.0
  const sqrtFc = Math.sqrt(fc)
  const psiG = fy <= 420 ? 1.0 : fy <= 550 ? 1.15 : 1.3
  const psiT = topBar ? 1.3 : 1.0
  const psiE = epoxy ? 1.5 : 1.0
  const psiTE = Math.min(psiT * psiE, 1.7)
  const psiS = (db: number) => (db <= 20 ? 0.8 : 1.0)
  const cb = cover + perimDia / 2
  const confTerm = (db: number) => Math.min(2.5, cb / db)

  const ldTension = (db: number) => {
    const num = fy * psiTE * psiS(db) * psiG
    const den = 1.1 * lambda * sqrtFc * confTerm(db)
    const ld = (num / den) * db
    return Math.max(300, Math.ceil(ld / 10) * 10)
  }

  const ldHook = (db: number) => {
    const psiR = hookSide === 'confined' ? 1.0 : 1.6
    const psiO = 1.0
    const psiC = 1.0
    const psiEh = epoxy ? 1.2 : 1.0
    const ldh = (fy * psiEh * psiR * psiO * psiC) / (23 * lambda * sqrtFc) * Math.pow(db, 1.5)
    return Math.max(8 * db, 150, Math.ceil(ldh / 10) * 10)
  }

  const ldComp = (db: number) => {
    const psiR = 1.0
    const a = (0.24 * fy * psiR) / (lambda * sqrtFc) * db
    const b2 = 0.043 * fy * psiR * db
    return Math.max(200, Math.ceil(Math.max(a, b2) / 10) * 10)
  }

  const lapFactor = spliceClass === 'A' ? 1.0 : 1.3
  const lapTension = (db: number) => Math.max(300, Math.ceil((ldTension(db) * lapFactor) / 10) * 10)

  const lapComp = (db: number) => {
    let l = fy <= 420 ? 0.071 * fy * db : (0.13 * fy - 24) * db
    if (fc < 21) l *= 4 / 3
    return Math.max(300, Math.ceil(l / 10) * 10)
  }

  const classAEligible = pctSpliced <= 50
  const trussCount = [...t1Bent, ...t2Bent].filter(v => v === 'both').length
  const ldGov = ldTension(t1Dia)
  const bendOk = bendL >= ldGov

  type Row = { label: string; db: number; show?: boolean }
  const barRows: Row[] = [
    { label: 'Bot L1', db: t1Dia },
    { label: 'Bot L2', db: t2Dia, show: t2Dia > 0 },
    { label: 'Top L1 (hanger)', db: c1Dia },
    { label: 'Top L2 (hanger)', db: c2Dia, show: c2Dia > 0 },
    { label: 'Perimeter', db: perimDia },
  ].filter(r => r.show !== false)

  return (
    <div className="card" data-step="4b-development">
      <div className="card-h">
        <span className="num-badge">4b</span>
        <span className="label">Development Length &amp; Splicing</span>
        <span style={{ color: 'var(--color-ink-4)', fontSize: 10.5 }} className="mono">
          ACI 318-19 §25.4 / NSCP 2015 §425 · λ={lambda.toFixed(1)}, ψg={psiG.toFixed(2)} · interactive modifier calculator (ACI/NSCP only — EC2/CSA use code.Ld() in Step 5)
        </span>
        <div className="right">
          <span className={'tag ' + (bendOk ? 'pass' : 'fail')}>
            bend {bendL} ≥ ld {ldGov} {bendOk ? '✓' : '✗'}
          </span>
        </div>
      </div>

      {/* Modifier strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}>
        <ModCell label="ψt · top bar" sub="cast >300mm fresh below" active={topBar}>
          <div className="toggle-strip" style={{ height: 22 }}>
            <button type="button" className={!topBar ? 'active' : ''} onClick={() => setTopBar(false)} style={{ padding: '0 8px', fontSize: 10.5 }}>1.0</button>
            <button type="button" className={topBar ? 'active' : ''} onClick={() => setTopBar(true)} style={{ padding: '0 8px', fontSize: 10.5 }}>1.3 top</button>
          </div>
        </ModCell>
        <ModCell label="ψe · coating" sub="epoxy / zinc-epoxy" active={epoxy}>
          <div className="toggle-strip" style={{ height: 22 }}>
            <button type="button" className={!epoxy ? 'active' : ''} onClick={() => setEpoxy(false)} style={{ padding: '0 8px', fontSize: 10.5 }}>1.0 black</button>
            <button type="button" className={epoxy ? 'active' : ''} onClick={() => setEpoxy(true)} style={{ padding: '0 8px', fontSize: 10.5 }}>1.5 epoxy</button>
          </div>
        </ModCell>
        <ModCell label="ψr · hook conf" sub="ties enclose hook">
          <div className="toggle-strip" style={{ height: 22 }}>
            <button type="button" className={hookSide === 'confined' ? 'active' : ''} onClick={() => setHookSide('confined')} style={{ padding: '0 8px', fontSize: 10.5 }}>1.0 conf</button>
            <button type="button" className={hookSide === 'unconfined' ? 'active' : ''} onClick={() => setHookSide('unconfined')} style={{ padding: '0 8px', fontSize: 10.5 }}>1.6 unc</button>
          </div>
        </ModCell>
        <ModCell label="splice class" sub="§25.5.2.1">
          <div className="toggle-strip" style={{ height: 22 }}>
            <button type="button" className={spliceClass === 'A' ? 'active' : ''} onClick={() => setSpliceClass('A')} style={{ padding: '0 8px', fontSize: 10.5 }}>A · 1.0</button>
            <button type="button" className={spliceClass === 'B' ? 'active' : ''} onClick={() => setSpliceClass('B')} style={{ padding: '0 8px', fontSize: 10.5 }}>B · 1.3</button>
          </div>
        </ModCell>
        <ModCell label="% spliced" sub={classAEligible && spliceClass === 'A' ? 'Class A eligible' : 'use Class B'}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[25, 50, 75, 100].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPctSpliced(p)}
                style={{
                  padding: '2px 6px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  borderRadius: 3,
                  cursor: 'pointer',
                  border: '1px solid ' + (pctSpliced === p ? 'var(--color-ink-2)' : 'var(--color-line)'),
                  background: pctSpliced === p ? 'var(--color-ink)' : '#fff',
                  color: pctSpliced === p ? '#fff' : 'var(--color-ink-3)',
                }}
              >
                {p}%
              </button>
            ))}
          </div>
        </ModCell>
      </div>

      {/* Per-bar table + governing equation cards */}
      <div className="card-b" style={{ padding: 0, display: 'grid', gridTemplateColumns: '1.4fr 1fr' }}>
        <div style={{ borderRight: '1px solid var(--color-line-2)' }}>
          <table className="t" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>bar</th>
                <th className="num" style={{ width: 36, textAlign: 'right' }}>db</th>
                <th className="num" style={{ textAlign: 'right' }}>ld <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>tens</span></th>
                <th className="num" style={{ textAlign: 'right' }}>ldh <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>hook</span></th>
                <th className="num" style={{ textAlign: 'right' }}>ldc <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>comp</span></th>
                <th className="num" style={{ textAlign: 'right' }}>
                  ls <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>tens·{spliceClass}</span>
                </th>
                <th className="num" style={{ textAlign: 'right' }}>ls <span style={{ color: 'var(--color-ink-4)', fontWeight: 400 }}>comp</span></th>
              </tr>
            </thead>
            <tbody>
              {barRows.map(r => (
                <tr key={r.label}>
                  <td><span style={{ fontWeight: 500 }}>{r.label}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">Ø{r.db}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono">{ldTension(r.db)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{ldHook(r.db)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{ldComp(r.db)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ fontWeight: 600 }}>{lapTension(r.db)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}><span className="mono" style={{ color: 'var(--color-ink-3)' }}>{lapComp(r.db)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{ padding: '6px 12px', fontSize: 10, color: 'var(--color-ink-4)', borderTop: '1px solid var(--color-line-2)', background: 'var(--color-bg)' }}
            className="mono"
          >
            all values in mm · rounded ↑ 10 mm · Ktr = 0 (conservative) · cb = {cb} mm · √f'c = {sqrtFc.toFixed(2)}
          </div>
        </div>

        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EqCard
            title="Tension · ld (§25.4.2.3)"
            eq="ld = (fy · ψt·ψe·ψs·ψg) / (1.1·λ·√f'c · (cb+Ktr)/db) · db"
            sub={[
              `ψt·ψe = ${psiTE.toFixed(2)}  ·  ψg = ${psiG.toFixed(2)}  ·  ψs(Ø20) = ${psiS(20).toFixed(2)}`,
              `(cb+Ktr)/db = ${confTerm(t1Dia).toFixed(2)} ≤ 2.5`,
              `min: 300 mm`,
            ]}
          />
          <EqCard
            title="Hook · ldh (§25.4.3.1)"
            eq="ldh = fy · ψe·ψr·ψo·ψc / (23·λ·√f'c) · db^1.5"
            sub={[
              `ψr = ${hookSide === 'confined' ? '1.0 (confined)' : '1.6 (unconfined)'}`,
              `min: max(8·db, 150 mm)`,
            ]}
          />
          <EqCard
            title="Lap splice · ls"
            eq={`tens: ls = ${lapFactor.toFixed(1)}·ld  (Class ${spliceClass})  ·  comp: ls = ${fy <= 420 ? '0.071·fy·db' : '(0.13·fy−24)·db'}`}
            sub={[
              `Class A ⇔ ≤50% spliced AND As,prov ≥ 2·As,req`,
              `min: 300 mm  ·  ${fc < 21 ? 'comp ×1.33 (f\'c<21)' : ''}`,
            ]}
          />
        </div>
      </div>

      {/* Bar bending diagram */}
      <div style={{ borderTop: '1px solid var(--color-line-2)', padding: '10px 12px', background: 'var(--color-bg)' }}>
        <div className="sub-label" style={{ marginBottom: 6 }}>Bar bending &amp; splice plan</div>
        <BarBendDiagram
          span={span}
          h={h}
          cover={cover}
          bendL={bendL}
          ldTop={ldTension(c1Dia)}
          ldBot={ldTension(t1Dia)}
          ldhTop={ldHook(c1Dia)}
          ldhBot={ldHook(t1Dia)}
          lsTop={lapTension(c1Dia)}
          lsBot={lapTension(t1Dia)}
          spliceClass={spliceClass}
          topHangerCount={c1Count + c2Count}
          botBarCount={(t1Count - t1Bent.filter(v => v === 'both').length) + (t2Count - t2Bent.filter(v => v === 'both').length)}
          bentBarCount={trussCount}
          width={860}
          height={210}
        />
        <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: 'var(--color-ink-3)', marginTop: 6, flexWrap: 'wrap' }}>
          <Legend swatch="#B06008">continuous bottom bar</Legend>
          <Legend swatch="#157A6A">top hanger</Legend>
          <Legend swatch="#A12424" dashed>development length zone</Legend>
          <Legend block="#FEE7B8" border="#B06008">lap splice ls (Class {spliceClass})</Legend>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-4)', marginTop: 6 }}>
          Stagger splices ≥ 0.3·ls or 600 mm. Avoid splices in plastic-hinge zones (within 2h of joint face). ·{' '}
          {trussCount > 0
            ? `${trussCount} truss bar${trussCount > 1 ? 's' : ''} bent @ ${bendL} mm — must extend ≥ ld past inflection.`
            : 'No bent-up bars — straight bottom bars develop into supports per §9.7.3.'}
        </div>
      </div>
    </div>
  )
}

function ModCell({
  label,
  sub,
  children,
  active,
}: {
  label: string
  sub: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <div style={{ padding: '8px 10px', borderRight: '1px solid var(--color-line-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 9.5, color: 'var(--color-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{label}</span>
        {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A12424' }} />}
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>{sub}</div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  )
}

function EqCard({ title, eq, sub }: { title: string; eq: string; sub?: string[] }) {
  return (
    <div style={{ border: '1px solid var(--color-line-2)', borderRadius: 4, background: '#fff' }}>
      <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--color-line-2)', fontSize: 10, fontWeight: 600, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink)', lineHeight: 1.4 }}>{eq}</div>
        {sub?.map((s, i) => (
          <div key={i} className="mono" style={{ fontSize: 9.5, color: 'var(--color-ink-4)', marginTop: 2 }}>{s}</div>
        ))}
      </div>
    </div>
  )
}

function Legend({
  swatch,
  block,
  border,
  dashed,
  children,
}: {
  swatch?: string
  block?: string
  border?: string
  dashed?: boolean
  children: React.ReactNode
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {swatch && (
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 2,
            background: swatch,
            marginRight: 4,
            verticalAlign: 'middle',
            borderTop: dashed ? `2px dashed ${swatch}` : undefined,
          }}
        />
      )}
      {block && (
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 8,
            background: block,
            border: `1px solid ${border ?? '#000'}`,
            marginRight: 4,
            verticalAlign: 'middle',
          }}
        />
      )}
      {children}
    </span>
  )
}
