import { useSyncExternalStore } from 'react'

let code = ''
let listeners: (() => void)[] = []

function emit() { for (const l of listeners) l() }

export function setStaadCode(c: string) {
  if (c === code) return
  code = c
  emit()
}

export function useStaadCode(): string {
  return useSyncExternalStore(
    cb => { listeners.push(cb); return () => { listeners = listeners.filter(l => l !== cb) } },
    () => code,
    () => '',
  )
}
