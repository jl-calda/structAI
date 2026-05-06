/**
 * SyncBanner — uses the new monochrome `.sync` class.
 * Three states:
 *   green: STAAD connected (file + units + hash + last sync)
 *   amber: STAAD offline (no record yet)
 *   red:   STAAD model mismatch (N members changed)
 */
import type { LatestSync } from '@/lib/data/staad'
import { shortHash } from '@/lib/format'

type Tone = 'green' | 'amber' | 'red'

export function SyncBanner({ latest }: { latest: LatestSync }) {
  const tone: Tone = latest === null
    ? 'amber'
    : latest.status === 'red'
      ? 'red'
      : 'green'

  const cls = tone === 'green' ? 'sync' : tone === 'amber' ? 'sync amber' : 'sync red'

  if (!latest) {
    return (
      <div className={cls}>
        <span className="led" />
        <span style={{ fontWeight: 500 }}>STAAD offline</span>
        <span style={{ color: 'var(--color-ink-3)' }}>
          — no sync on record. Run the bridge to populate this project.
        </span>
      </div>
    )
  }

  if (tone === 'red') {
    const n = latest.row.mismatch_members.length
    return (
      <div className={cls}>
        <span className="led" />
        <span style={{ fontWeight: 500 }}>STAAD model mismatch</span>
        <span className="mono" style={{ color: 'var(--color-ink-3)' }}>
          · {n} member{n === 1 ? '' : 's'} changed since last verified sync
        </span>
      </div>
    )
  }

  const units = latest.row.unit_system ?? 'unknown'
  return (
    <div className={cls}>
      <span className="led" />
      <span style={{ fontWeight: 500 }}>STAAD connected</span>
      <span className="mono" style={{ color: 'var(--color-ink-3)' }}>
        · {latest.row.file_name}
        {' · '}{units}
        {' · '}{latest.row.synced_at.slice(0, 16).replace('T', ' ')}
        {' · '}{shortHash(latest.row.file_hash)}
      </span>
    </div>
  )
}
