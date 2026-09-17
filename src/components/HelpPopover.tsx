import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './HelpPopover.css'

export function HelpPopover({ label, children, triggerText }: {
  label: string
  children: ReactNode
  triggerText?: string
}) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || focused || pinned

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }, [])

  const close = useCallback(() => {
    clearHoverTimer()
    setHovered(false)
    setFocused(false)
    setPinned(false)
  }, [clearHoverTimer])

  const enter = (pointerType: string) => {
    if (pointerType === 'touch') return
    clearHoverTimer()
    setHovered(true)
  }

  const leave = (pointerType: string) => {
    if (pointerType === 'touch') return
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      setHovered(false)
    }, 180)
  }

  useLayoutEffect(() => clearHoverTimer, [clearHoverTimer])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return

    const position = () => {
      // A manual top-layer popover can outlive a collapsed parent panel.
      if (!trigger.isConnected || trigger.getClientRects().length === 0
        || getComputedStyle(trigger).visibility !== 'visible') {
        close()
        return
      }

      const margin = 12
      const gap = 6
      const width = document.documentElement.clientWidth
      const height = window.innerHeight
      const anchor = trigger.getBoundingClientRect()
      const panel = popover.getBoundingClientRect()
      const below = anchor.bottom + gap
      const top = below + panel.height <= height - margin ? below : anchor.top - gap - panel.height
      popover.style.left = `${Math.max(margin, Math.min(anchor.left, width - panel.width - margin))}px`
      popover.style.top = `${Math.max(margin, Math.min(top, height - panel.height - margin))}px`
    }

    const onOutsideInteraction = (event: Event) => {
      if (event.target instanceof Node && !trigger.contains(event.target) && !popover.contains(event.target)) close()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }

    if (typeof popover.showPopover === 'function') popover.showPopover()
    else popover.dataset.fallbackOpen = 'true'
    position()

    const resizeObserver = new ResizeObserver(position)
    resizeObserver.observe(trigger)
    resizeObserver.observe(popover)
    const visibilityObserver = new MutationObserver(position)
    for (let ancestor: HTMLElement | null = trigger.parentElement; ancestor; ancestor = ancestor.parentElement) {
      visibilityObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] })
    }
    document.addEventListener('pointerdown', onOutsideInteraction, true)
    document.addEventListener('focusin', onOutsideInteraction, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)

    return () => {
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      document.removeEventListener('pointerdown', onOutsideInteraction, true)
      document.removeEventListener('focusin', onOutsideInteraction, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
      if (typeof popover.hidePopover === 'function' && popover.matches(':popover-open')) popover.hidePopover()
      delete popover.dataset.fallbackOpen
    }
  }, [open, close])

  return <span className="help-popover">
    <button
      ref={triggerRef}
      className={`help-popover-trigger${triggerText !== undefined ? ' help-popover-text-trigger' : ''}`}
      type="button"
      aria-label={label}
      aria-controls={id}
      aria-describedby={id}
      aria-expanded={open}
      onPointerEnter={(event) => enter(event.pointerType)}
      onPointerLeave={(event) => leave(event.pointerType)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => {
        if (pinned) close()
        else setPinned(true)
      }}
    >
      {triggerText !== undefined ? triggerText : <span aria-hidden="true">?</span>}
    </button>
    <div
      ref={popoverRef}
      id={id}
      className="help-popover-panel"
      popover="manual"
      role="tooltip"
      onPointerEnter={(event) => enter(event.pointerType)}
      onPointerLeave={(event) => leave(event.pointerType)}
    >
      {children}
    </div>
  </span>
}
