/**
 * Pure display helpers. Client-safe — no server imports.
 */

export function shortHash(hash: string): string {
  return hash.slice(0, 8).toUpperCase()
}

export function formatSyncedAt(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ')
}
