'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * Mobile sidebar toggle buttons + backdrop. Only visible on screens ≤ 768px.
 * Controls the .mobile-open class on .left and .right elements.
 */
export function MobileNavToggle() {
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  useEffect(() => {
    const left = document.querySelector('.left')
    const right = document.querySelector('.right')
    if (left) {
      left.classList.toggle('mobile-open', leftOpen)
    }
    if (right) {
      right.classList.toggle('mobile-open', rightOpen)
    }
  }, [leftOpen, rightOpen])

  const closeAll = () => {
    setLeftOpen(false)
    setRightOpen(false)
  }

  return (
    <>
      {/* Backdrop — closes panels when tapped */}
      {(leftOpen || rightOpen) && (
        <div className="mobile-backdrop visible" onClick={closeAll} />
      )}

      {/* Left sidebar toggle */}
      <button
        type="button"
        className="mobile-toggle mobile-toggle-left"
        onClick={() => { setRightOpen(false); setLeftOpen(p => !p) }}
        aria-label="Toggle sidebar"
      >
        <Icon name={leftOpen ? 'chevL' : 'members'} size={14} />
      </button>

      {/* Right inspector toggle */}
      <button
        type="button"
        className="mobile-toggle mobile-toggle-right"
        onClick={() => { setLeftOpen(false); setRightOpen(p => !p) }}
        aria-label="Toggle inspector"
      >
        <Icon name={rightOpen ? 'chevR' : 'info'} size={14} />
      </button>
    </>
  )
}
