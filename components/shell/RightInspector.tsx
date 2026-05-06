'use client'

import { useState } from 'react'

import { Icon } from '@/components/ui/Icon'
import { useResizable } from '@/lib/hooks/useResizable'

export type InspectorData = {
  title: string
  subtitle?: string
  status: 'pass' | 'fail' | 'pending'
  identity: { k: string; v: string }[]
  materials: { k: string; v: string }[]
  forces?: { k: string; v: string }[]
  reinforcement?: { k: string; v: string }[]
  capacity?: { k: string; v: string; tone?: 'pass' | 'fail' }[]
  sync?: { k: string; v: string }[]
  staadCode?: string
  checks?: { k: string; v: string; pass: boolean }[]
  stirrupZones?: { zone: string; region: string; spacing: string; n: number }[]
}

export function RightInspector({ data }: { data?: InspectorData }) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<'inspect' | 'staad' | 'checks'>('inspect')
  const [w, startDrag] = useResizable(300, 220, 520, 'right', 'structai.right.w')

  if (collapsed) {
    return (
      <aside className="right collapsed">
        <div className="right-collapsed-rail">
          <button className="iconbtn" onClick={() => setCollapsed(false)} title="Inspector">
            <Icon name="info" size={14} />
          </button>
          <button className="iconbtn" onClick={() => setCollapsed(false)} title=".STD Code">
            <Icon name="code" size={14} />
          </button>
          <button className="iconbtn" onClick={() => setCollapsed(false)} title="Checks">
            <Icon name="check" size={14} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="right" style={{ width: w }}>
      <div className="resizer resizer-r" onMouseDown={startDrag} />
      <div className="insp-tabs">
        <div className={'insp-tab ' + (tab === 'inspect' ? 'active' : '')} onClick={() => setTab('inspect')}>Inspector</div>
        <div className={'insp-tab ' + (tab === 'staad' ? 'active' : '')} onClick={() => setTab('staad')}>.STD Code</div>
        <div className={'insp-tab ' + (tab === 'checks' ? 'active' : '')} onClick={() => setTab('checks')}>Checks</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 6 }}>
          <button className="iconbtn" onClick={() => setCollapsed(true)} title="Collapse">
            <Icon name="chevR" size={13} />
          </button>
        </div>
      </div>
      <div className="insp-content">
        {!data ? (
          <div className="insp-section">
            <p style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>
              Select a beam, column, slab or footing to see its details here.
            </p>
          </div>
        ) : tab === 'inspect' ? (
          <InspectTab data={data} />
        ) : tab === 'staad' ? (
          <StaadCodeTab code={data.staadCode ?? ''} />
        ) : (
          <ChecksTab checks={data.checks ?? []} stirrupZones={data.stirrupZones ?? []} />
        )}
      </div>
    </aside>
  )
}

function InspectTab({ data }: { data: InspectorData }) {
  return (
    <>
      <div className="insp-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{data.title}</span>
          <span className={'tag ' + (data.status === 'pass' ? 'pass' : data.status === 'fail' ? 'fail' : 'warn')}>
            {data.status.toUpperCase()}
          </span>
        </div>
        {data.subtitle && (
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--color-ink-3)' }}>{data.subtitle}</div>
        )}
      </div>

      {data.identity.length > 0 && (
        <Section title="Identity" rows={data.identity} />
      )}
      {data.materials.length > 0 && (
        <Section title="Materials" rows={data.materials} />
      )}
      {data.forces && data.forces.length > 0 && (
        <Section title="Governing Forces" rows={data.forces} />
      )}
      {data.reinforcement && data.reinforcement.length > 0 && (
        <Section title="Reinforcement" rows={data.reinforcement} />
      )}
      {data.capacity && data.capacity.length > 0 && (
        <div className="insp-section">
          <h4>Capacity</h4>
          {data.capacity.map((r, i) => (
            <div key={i} className="insp-row">
              <span className="k">{r.k}</span>
              <span className={'v' + (r.tone === 'pass' ? ' pass' : r.tone === 'fail' ? ' fail' : '')}>{r.v}</span>
            </div>
          ))}
        </div>
      )}
      {data.sync && data.sync.length > 0 && (
        <Section title="Sync" rows={data.sync} />
      )}
    </>
  )
}

function Section({ title, rows }: { title: string; rows: { k: string; v: string }[] }) {
  return (
    <div className="insp-section">
      <h4>{title}</h4>
      {rows.map((r, i) => (
        <div key={i} className="insp-row">
          <span className="k">{r.k}</span>
          <span className="v">{r.v}</span>
        </div>
      ))}
    </div>
  )
}

function StaadCodeTab({ code }: { code: string }) {
  return (
    <div style={{ padding: 0 }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-line-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="code" size={12} />
        <span style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>STAAD source</span>
        <span className="pill" style={{ marginLeft: 'auto' }}><span className="led" /> in sync</span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          lineHeight: 1.55,
          color: 'var(--color-ink-2)',
          background: 'var(--color-panel)',
          whiteSpace: 'pre',
          overflow: 'auto',
        }}
      >
        {code.split('\n').map((line, i) => {
          const isComment = line.trim().startsWith('*')
          const head = line.trim().split(/\s+/)[0] ?? ''
          const isKw = /^(MEMBER|LOAD|START|END|PROPERTY|CONSTANTS|UNI|PRIS|CODE|FC|FY|CLEAR|TRACK|DESIGN|PRINT|PERFORM|CONCRETE|MATERIAL|COMB|FYMAIN)$/.test(head)
          return (
            <div key={i} style={{ display: 'flex' }}>
              <span style={{ display: 'inline-block', width: 24, color: 'var(--color-ink-5)', textAlign: 'right', paddingRight: 8, userSelect: 'none' }}>
                {i + 1}
              </span>
              <span style={{ color: isComment ? 'var(--color-ink-4)' : isKw ? 'var(--color-sel)' : 'var(--color-ink)' }}>
                {line || ' '}
              </span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function ChecksTab({
  checks,
  stirrupZones,
}: {
  checks: { k: string; v: string; pass: boolean }[]
  stirrupZones: { zone: string; region: string; spacing: string; n: number }[]
}) {
  return (
    <>
      <div className="insp-section">
        <h4>Code checks</h4>
        {checks.length === 0 ? (
          <p style={{ fontSize: 11, color: 'var(--color-ink-3)' }}>Run design to see check results.</p>
        ) : (
          checks.map((c, i, arr) => (
            <div key={i} className="insp-row" style={{ padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px dashed var(--color-line-2)' : 'none' }}>
              <div>
                <div style={{ color: 'var(--color-ink-2)', fontSize: 11 }}>{c.k}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--color-ink-3)', marginTop: 1 }}>{c.v}</div>
              </div>
              <span className={'tag ' + (c.pass ? 'pass' : 'fail')}>{c.pass ? 'PASS' : 'FAIL'}</span>
            </div>
          ))
        )}
      </div>
      {stirrupZones.length > 0 && (
        <div className="insp-section">
          <h4>Stirrup zones</h4>
          <table className="t">
            <thead>
              <tr><th>Zone</th><th>Region</th><th>Spacing</th><th>n</th></tr>
            </thead>
            <tbody>
              {stirrupZones.map((z, i) => (
                <tr key={i}><td>{z.zone}</td><td className="num">{z.region}</td><td className="num">{z.spacing}</td><td className="num">{z.n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
