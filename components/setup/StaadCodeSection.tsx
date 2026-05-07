'use client'

import { useState } from 'react'

import { Icon } from '@/components/ui/Icon'
import {
  generateLoadCaseBlock,
  staadLoadType,
  type MemberLoad,
} from '@/lib/staad/syntax'

type MemberLite = { member_id: number; section_name: string; length_mm: number; member_type: string }

export function StaadCodeSection({
  caseNumber,
  loadType,
  title,
  members,
}: {
  caseNumber: number
  loadType: string
  title: string
  members: MemberLite[]
}) {
  const [open, setOpen] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<number[]>([])
  const [loadMethod, setLoadMethod] = useState<'UNI' | 'CON' | 'LIN'>('UNI')
  const [w, setW] = useState(10)
  const [w2, setW2] = useState(5)
  const [pVal, setPVal] = useState(50)
  const [dist, setDist] = useState(3000)
  const [d1, setD1] = useState(0)
  const [d2, setD2] = useState(0)

  const declaration = `LOAD ${caseNumber} LOADTYPE ${staadLoadType(loadType)} TITLE ${title}`

  const memberLoads: MemberLoad[] = selectedMembers.map(mid => {
    const m = members.find(mm => mm.member_id === mid)
    const len = m?.length_mm ?? 0
    if (loadMethod === 'UNI') {
      return d1 > 0 || d2 > 0
        ? { memberId: mid, type: 'UNI' as const, dir: 'GY' as const, w, d1, d2: d2 || len }
        : { memberId: mid, type: 'UNI' as const, dir: 'GY' as const, w }
    }
    if (loadMethod === 'CON') {
      return { memberId: mid, type: 'CON' as const, dir: 'GY' as const, p: pVal, d: dist }
    }
    return d1 > 0 || d2 > 0
      ? { memberId: mid, type: 'LIN' as const, dir: 'GY' as const, w1: w, w2, d1, d2: d2 || len }
      : { memberId: mid, type: 'LIN' as const, dir: 'GY' as const, w1: w, w2 }
  })

  const fullCode = selectedMembers.length > 0
    ? generateLoadCaseBlock({
        caseNumber,
        loadType: staadLoadType(loadType),
        title,
        memberLoads,
      })
    : declaration

  const copy = () => {
    navigator.clipboard.writeText(fullCode).catch(() => {})
  }

  const toggleMember = (mid: number) => {
    setSelectedMembers(prev =>
      prev.includes(mid) ? prev.filter(x => x !== mid) : [...prev, mid],
    )
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-line-2)', marginTop: 6 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '6px 10px', background: 'var(--color-bg)', border: 0,
          cursor: 'pointer', fontSize: 10.5, color: 'var(--color-ink-2)',
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
        }}
      >
        <Icon name={open ? 'chevDown' : 'chevR'} size={10} />
        STAAD Code
        <span className="mono" style={{ fontWeight: 400, color: 'var(--color-ink-4)', textTransform: 'none' }}>
          LOAD {caseNumber}
        </span>
      </button>

      {open && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Code preview */}
          <div style={{ position: 'relative' }}>
            <pre
              style={{
                margin: 0, padding: '10px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.5,
                color: 'var(--color-ink)', background: 'var(--color-panel)',
                border: '1px solid var(--color-line)', borderRadius: 4,
                whiteSpace: 'pre', overflow: 'auto', maxHeight: 200,
              }}
            >
              {fullCode}
            </pre>
            <button
              type="button"
              onClick={copy}
              className="btn sm"
              style={{ position: 'absolute', top: 6, right: 6 }}
            >
              <Icon name="download" size={11} /> Copy
            </button>
          </div>

          {/* Optional member loads */}
          {members.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="sub-label">Optional: add member loads (or assign in STAAD directly)</div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {members.slice(0, 30).map(m => {
                  const sel = selectedMembers.includes(m.member_id)
                  return (
                    <button
                      key={m.member_id}
                      type="button"
                      onClick={() => toggleMember(m.member_id)}
                      style={{
                        padding: '2px 6px', fontSize: 10, fontFamily: 'var(--font-mono)',
                        borderRadius: 3, cursor: 'pointer',
                        border: '1px solid ' + (sel ? 'var(--color-ink)' : 'var(--color-line)'),
                        background: sel ? 'var(--color-ink)' : '#fff',
                        color: sel ? '#fff' : 'var(--color-ink-3)',
                      }}
                    >
                      {m.member_id}
                    </button>
                  )
                })}
                {members.length > 30 && (
                  <span style={{ fontSize: 10, color: 'var(--color-ink-4)' }}>+{members.length - 30} more</span>
                )}
              </div>

              {selectedMembers.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    value={loadMethod}
                    onChange={e => setLoadMethod(e.target.value as 'UNI' | 'CON' | 'LIN')}
                    style={{ height: 22, width: 80 }}
                  >
                    <option value="UNI">UNI (UDL)</option>
                    <option value="CON">CON (Point)</option>
                    <option value="LIN">LIN (Trapez.)</option>
                  </select>

                  {loadMethod === 'UNI' && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        w
                        <input className="input" type="number" value={w} onChange={e => setW(Number(e.target.value))} style={{ width: 60, height: 20 }} />
                        <span style={{ color: 'var(--color-ink-4)' }}>kN/m</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        d1
                        <input className="input" type="number" value={d1} onChange={e => setD1(Number(e.target.value))} style={{ width: 50, height: 20 }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        d2
                        <input className="input" type="number" value={d2} onChange={e => setD2(Number(e.target.value))} style={{ width: 50, height: 20 }} />
                        <span style={{ color: 'var(--color-ink-4)' }}>mm (0=full)</span>
                      </label>
                    </>
                  )}

                  {loadMethod === 'CON' && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        P
                        <input className="input" type="number" value={pVal} onChange={e => setPVal(Number(e.target.value))} style={{ width: 60, height: 20 }} />
                        <span style={{ color: 'var(--color-ink-4)' }}>kN</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        d
                        <input className="input" type="number" value={dist} onChange={e => setDist(Number(e.target.value))} style={{ width: 60, height: 20 }} />
                        <span style={{ color: 'var(--color-ink-4)' }}>mm from start</span>
                      </label>
                    </>
                  )}

                  {loadMethod === 'LIN' && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        w1
                        <input className="input" type="number" value={w} onChange={e => setW(Number(e.target.value))} style={{ width: 50, height: 20 }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        w2
                        <input className="input" type="number" value={w2} onChange={e => setW2(Number(e.target.value))} style={{ width: 50, height: 20 }} />
                        <span style={{ color: 'var(--color-ink-4)' }}>kN/m</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        d1
                        <input className="input" type="number" value={d1} onChange={e => setD1(Number(e.target.value))} style={{ width: 50, height: 20 }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5 }}>
                        d2
                        <input className="input" type="number" value={d2} onChange={e => setD2(Number(e.target.value))} style={{ width: 50, height: 20 }} />
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
