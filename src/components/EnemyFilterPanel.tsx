import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CollapsibleCalculatorPanel } from './CollapsibleCalculatorPanel'
import './EnemyFilterPanel.css'

interface PendingFocus {
  key: string | null
  selection?: { start: number | null; end: number | null; direction: 'forward' | 'backward' | 'none' | null }
}

export function EnemyFilterPanel({ summary, compactControls, children }: {
  summary: string
  compactControls: ReactNode
  children: ReactNode
}) {
  const normalRef = useRef<HTMLDivElement>(null)
  const compactRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<PendingFocus | null>(null)
  const [navigation, setNavigation] = useState({ compact: false, left: 0, width: 0 })

  // Match the skill/module navigation: keep the full panel's space in the document.
  useLayoutEffect(() => {
    const normal = normalRef.current
    const compact = compactRef.current
    if (!normal || !compact) return
    let frame = 0
    const update = () => {
      const top = Number.parseFloat(window.getComputedStyle(compact).top) || 0
      const bounds = normal.getBoundingClientRect()
      const isCompact = bounds.bottom <= top
      const wasCompact = !compact.hidden
      if (isCompact !== wasCompact) {
        const previous = wasCompact ? compact : normal
        const focused = document.activeElement
        if (focused instanceof HTMLElement && previous.contains(focused)) {
          pendingFocus.current = {
            key: focused.getAttribute('data-enemy-filter-control'),
            selection: focused instanceof HTMLInputElement ? {
              start: focused.selectionStart,
              end: focused.selectionEnd,
              direction: focused.selectionDirection,
            } : undefined,
          }
          focused.blur()
        }
      }
      setNavigation((current) => current.compact === isCompact && current.left === bounds.left && current.width === bounds.width
        ? current : { compact: isCompact, left: bounds.left, width: bounds.width })
    }
    const requestUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    const observer = new ResizeObserver(requestUpdate)
    observer.observe(normal)
    if (normal.parentElement) observer.observe(normal.parentElement)
    if (normal.parentElement?.previousElementSibling) observer.observe(normal.parentElement.previousElementSibling)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const pending = pendingFocus.current
    pendingFocus.current = null
    if (!pending) return
    const target = navigation.compact ? compactRef.current : normalRef.current
    const controls = Array.from(target?.querySelectorAll<HTMLElement>('[data-enemy-filter-control]') ?? [])
    const visible = (key: string | null) => controls.find((control) => control.dataset.enemyFilterControl === key
      && !control.matches(':disabled') && control.getClientRects().length > 0)
    const control = visible(pending.key) ?? visible('query') ?? target?.querySelector<HTMLElement>('#enemy-filters-heading')
    control?.focus({ preventScroll: true })
    if (control instanceof HTMLInputElement && pending.selection) {
      control.setSelectionRange(pending.selection.start, pending.selection.end, pending.selection.direction ?? undefined)
    }
  }, [navigation.compact])

  return <>
    <div ref={normalRef} className="enemy-filter-normal" inert={navigation.compact} aria-hidden={navigation.compact}>
      <CollapsibleCalculatorPanel
        id="enemy-filters"
        number="01"
        title="対象の絞り込み"
        summary={summary}
        collapsedLabel="条件を表示"
        className="enemy-filters"
      >
        {children}
      </CollapsibleCalculatorPanel>
    </div>
    <div
      ref={compactRef}
      className="damage-build-navigation enemy-filter-compact is-stuck"
      role="region"
      aria-label="敵の絞り込み（追従表示）"
      hidden={!navigation.compact}
      style={{ left: navigation.left, width: navigation.width }}
    >
      {compactControls}
    </div>
  </>
}
