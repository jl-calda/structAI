/**
 * SyncBanner — full-width strip shown on every project page.
 * Three states (docs/09-pages.md):
 *
 *   Green:  "● STAAD Connected · BLDG-01.std · Last sync [date] · Hash [short]"
 *   Amber:  "○ STAAD offline — showing design from [date]"
 *   Red:    "⚠ STAAD Model Mismatch — [N] members changed"
 *
 * This is a pure presentational server component. The project layout passes
 * in the already-fetched latest sync; actions (Re-sync / Keep unverified)
 * are rendered as client buttons handled in Phase 2.
 */
import type { LatestSync } from '@/lib/data/staad'
import { shortHash } from '@/lib/format'

type Tone = 'green' | 'amber' | 'red'

function toneStyles(tone: Tone) {
  switch (tone) {
    case 'green':
      return {
        background: 'var(--color-green-l)',
        border: 'var(--color-green)',
        color: 'var(--color-green)',
        dot: 'var(--color-green)',
      }
    case 'amber':
      return {
        background: 'var(--color-amber-l)',
        border: 'var(--color-amber)',
        color: 'var(--color-amber)',
        dot: 'var(--color-amber)',
      }
    case 'red':
      return {
        background: 'var(--color-red-l)',
        border: 'var(--color-red)',
        color: 'var(--color-red)',
        dot: 'var(--color-red)',
      }
  }
}

export function SyncBanner({ latest }: { latest: LatestSync }) {
  const tone: Tone = latest === null
    ? 'amber'
    : latest.status === 'red'
      ? 'red'
      : 'green'

  const { background, border, color, dot } = toneStyles(tone)

  return (
    <div
      className="flex items-center gap-3 rounded px-3 py-1.5 text-[12px]"
      style={{ background, border: `0.5px solid ${border}`, color }}
    >
      <span
        aria-hidden
        className="inline-block h-[7px] w-[7px] rounded-full"
        style={{ background: dot }}
      />
      <BannerText latest={latest} tone={tone} />
    </div>
  )
}

function BannerText({ latest, tone }: { latest: LatestSync; tone: Tone }) {
  if (!latest) {
    return (
      <span>STAAD offline — no sync on record. Run the bridge to populate this project.</span>
    )
  }

  if (tone === 'red') {
    const n = latest.row.mismatch_members.length
    return (
      <span>
        STAAD model mismatch — <span className="mono">{n}</span>{' '}
        member{n === 1 ? '' : 's'} changed since the last verified sync.
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3">
      <span>STAAD connected</span>
      <span className="mono">{latest.row.file_name}</span>
      <span>· Last sync <span className="mono">{latest.row.synced_at.slice(0, 19).replace('T', ' ')}</span></span>
      <span>· Hash <span className="mono">{shortHash(latest.row.file_hash)}</span></span>
    </span>
  )
}
