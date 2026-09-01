import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { SkillClassificationOverride, SkillRecord } from '../types/skill'
import { SkillClassificationContent } from './SkillClassificationContent'

interface Props {
  id: string
  skill: SkillRecord
  description?: string
  override?: SkillClassificationOverride
  onOverride: (override: SkillClassificationOverride | null) => void
  onClose: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled])',
  'summary',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function SkillClassifierPopover({
  id,
  skill,
  description,
  override,
  onOverride,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const popover = popoverRef.current
    if (!popover) return

    if (typeof popover.showPopover === 'function') popover.showPopover()
    else popover.dataset.fallbackOpen = 'true'

    window.requestAnimationFrame(() => titleRef.current?.focus())

    return () => {
      if (typeof popover.hidePopover === 'function' && popover.matches(':popover-open')) {
        popover.hidePopover()
      }
      delete popover.dataset.fallbackOpen
    }
  }, [skill.id])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return
    const popover = popoverRef.current
    if (!popover) return
    const focusable = Array.from(popover.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
    if (focusable.length === 0) {
      event.preventDefault()
      titleRef.current?.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    event.stopPropagation()
    onClose()
  }

  return (
    <div
      ref={popoverRef}
      id={id}
      className="skill-classifier-popover"
      popover="manual"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <article className="skill-classifier-popover-panel">
        <header className="skill-classifier-popover-header">
          <div>
            <span>SKILL MODEL CLASSIFIER</span>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>S{skill.skillIndex} {skill.skillName}</h2>
            <p id={descriptionId}>{skill.operatorName} · 分類結果・判定根拠・手動修正</p>
          </div>
          <button type="button" aria-label={`${skill.skillName}の分類情報を閉じる`} onClick={onClose}>×</button>
        </header>

        <div className="skill-classifier-popover-body">
          <SkillClassificationContent
            skill={skill}
            description={description}
            override={override}
            sectionHeading="h3"
            onOverride={onOverride}
          />
        </div>
      </article>
    </div>
  )
}
