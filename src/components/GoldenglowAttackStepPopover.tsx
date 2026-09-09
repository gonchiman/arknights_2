import { useId, useLayoutEffect, useRef } from 'react'
import './GoldenglowAttackStepPopover.css'

export function GoldenglowAttackStepPopover({ id, label, description, breakdown, anchor, onClose }: {
  id: string
  label: string
  description: string
  breakdown: readonly { label: string, value: string }[]
  anchor: HTMLButtonElement
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => { onCloseRef.current = onClose }, [onClose])

  useLayoutEffect(() => {
    const popover = popoverRef.current
    if (!popover) return

    const position = () => {
      const margin = 12
      const gap = 8
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.innerHeight
      const anchorRect = anchor.getBoundingClientRect()
      const popoverRect = popover.getBoundingClientRect()
      const below = anchorRect.bottom + gap
      const top = below + popoverRect.height <= viewportHeight - margin
        ? below
        : anchorRect.top - gap - popoverRect.height

      popover.style.left = `${Math.max(margin, Math.min(anchorRect.left, viewportWidth - popoverRect.width - margin))}px`
      popover.style.top = `${Math.max(margin, Math.min(top, viewportHeight - popoverRect.height - margin))}px`
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || popover.contains(target) || anchor.closest('tr')?.contains(target)) return
      onCloseRef.current()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }

    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && popover.contains(event.target)) return
      onCloseRef.current()
    }

    popover.showPopover()
    position()
    titleRef.current?.focus({ preventScroll: true })
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', position)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', position)
      if (popover.contains(document.activeElement) && anchor.isConnected) {
        anchor.focus({ preventScroll: true })
      }
      if (popover.matches(':popover-open')) popover.hidePopover()
    }
  }, [anchor])

  return (
    <div
      ref={popoverRef}
      id={id}
      className="gg-attack-step-popover"
      popover="manual"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="gg-attack-step-popover-header">
        <h3 ref={titleRef} id={titleId} tabIndex={-1}>{label}の内訳</h3>
        <button type="button" aria-label={`${label}の内訳を閉じる`} onClick={onClose}>×</button>
      </header>
      <div className="gg-attack-step-popover-content">
        <p id={descriptionId}>{description}</p>
        <table className="gg-attack-step-popover-breakdown" aria-label={`${label}の内訳`}>
          <tbody>{breakdown.map((row) => <tr key={row.label}>
            <th scope="row">{row.label}</th><td>{row.value}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}
