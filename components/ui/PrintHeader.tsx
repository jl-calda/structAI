export function PrintHeader({
  projectName,
  designLabel,
  designType,
  codeStandard,
}: {
  projectName: string
  designLabel: string
  designType: string
  codeStandard: string
}) {
  return (
    <div className="print-only hidden mb-3" style={{ borderBottom: '1px solid #999', paddingBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{designLabel}</span>
          <span style={{ fontSize: '11px', color: '#666', marginLeft: '8px' }}>{designType}</span>
        </div>
        <div style={{ fontSize: '10px', color: '#666', textAlign: 'right' }}>
          <div>{projectName}</div>
          <div className="mono">{codeStandard}</div>
        </div>
      </div>
    </div>
  )
}
