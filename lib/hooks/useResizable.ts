'use client'

import { useEffect, useState } from 'react'

/**
 * Width-only horizontal resize hook for side panels.
 *
 * - `side: 'left'` — drag right edge: positive dx grows width
 * - `side: 'right'` — drag left edge: positive dx shrinks width
 * - `storageKey` — when provided, persists the width to localStorage
 *   so it survives across page loads / sessions.
 */
export function useResizable(
  initial: number,
  min: number,
  max: number,
  side: 'left' | 'right',
  storageKey?: string,
): [number, (e: React.MouseEvent) => void] {
  const [w, setW] = useState(initial)

  useEffect(() => {
    if (!storageKey) return
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const n = Number.parseInt(stored, 10)
      if (Number.isFinite(n) && n >= min && n <= max) setW(n)
    }
  }, [storageKey, min, max])

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = w
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const next = side === 'left' ? startW + dx : startW - dx
      const clamped = Math.max(min, Math.min(max, next))
      setW(clamped)
      if (storageKey) localStorage.setItem(storageKey, String(clamped))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return [w, startDrag]
}
