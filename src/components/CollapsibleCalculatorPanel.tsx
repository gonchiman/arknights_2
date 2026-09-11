import type { ReactNode } from 'react'
import { usePanelOpen } from '../lib/usePanelOpen'

export function CollapsibleCalculatorPanel({
  id,
  number,
  title,
  titleBadge,
  titleIcons,
  outputTable,
  summary,
  defaultOpen = true,
  collapsedLabel,
  disabled = false,
  disabledLabel = '操作できません',
  className = '',
  bodyClassName = '',
  children,
}: {
  id: string
  number: string
  title: string
  titleBadge?: string
  titleIcons?: ReactNode
  outputTable?: string
  summary: ReactNode
  defaultOpen?: boolean
  collapsedLabel: string
  disabled?: boolean
  disabledLabel?: string
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = usePanelOpen(id, defaultOpen)
  const headingId = `${id}-heading`
  const bodyId = `${id}-body`
  const effectiveOpen = !disabled && open

  return (
    <section data-output-table={outputTable} className={`calculator-panel collapsible-calculator-panel ${effectiveOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}>
      <h2 className="collapsible-panel-title">
        <button
          type="button"
          id={headingId}
          className={`panel-heading collapsible-panel-heading${titleBadge ? ' has-title-badge' : ''}`}
          aria-expanded={disabled ? undefined : effectiveOpen}
          aria-controls={disabled ? undefined : bodyId}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          <span className="collapsible-panel-heading-title">
            <span>{number}</span>
            <span className="collapsible-panel-heading-label">{title}</span>
            {titleIcons && <span className="collapsible-panel-heading-icons">{titleIcons}</span>}
            {titleBadge && <span className="collapsible-panel-heading-badge">{titleBadge}</span>}
          </span>
          <span className="collapsible-panel-heading-summary">
            <span>{summary}</span>
            <em>{disabled ? disabledLabel : `${effectiveOpen ? '閉じる' : collapsedLabel} ${effectiveOpen ? '−' : '+'}`}</em>
          </span>
        </button>
      </h2>
      <div
        id={bodyId}
        className={`collapsible-panel-body ${bodyClassName}`.trim()}
        role="region"
        aria-labelledby={headingId}
        hidden={!effectiveOpen}
      >
        {children}
      </div>
    </section>
  )
}
