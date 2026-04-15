/**
 * TopNav — 40px dark strip above the content area.
 * Page tab strip (bg chrome-tabs) is rendered per-project by the project
 * layout; this component only holds the global chrome row.
 */
export function TopNav({
  title,
  right,
}: {
  title?: string
  right?: React.ReactNode
}) {
  return (
    <header
      className="h-10 shrink-0 flex items-center justify-between px-4 border-b"
      style={{
        background: 'var(--color-chrome-topnav)',
        borderColor: 'var(--color-chrome-border)',
        color: 'var(--color-chrome-text)',
      }}
    >
      <div className="flex items-center gap-3 text-[12px]">
        <span className="font-semibold tracking-tight">StructAI</span>
        {title ? (
          <>
            <span style={{ color: 'var(--color-chrome-text2)' }}>/</span>
            <span style={{ color: 'var(--color-chrome-text)' }}>{title}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-[11px]"
           style={{ color: 'var(--color-chrome-text2)' }}>
        {right}
      </div>
    </header>
  )
}
