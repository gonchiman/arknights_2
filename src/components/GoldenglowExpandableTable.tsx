import { useId, useState, type ReactNode } from 'react'
import './GoldenglowExpandableTable.css'

const PREVIEW_ROW_COUNT = 10

export function GoldenglowExpandableTable<T>({ rows, regionLabel, tableWrapperClassName = '', children }: {
  rows: readonly T[]
  regionLabel: string
  tableWrapperClassName?: string
  children: (visibleRows: readonly T[]) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const tableId = useId()
  const visibleRows = expanded ? rows : rows.slice(0, PREVIEW_ROW_COUNT)
  const toggleLabel = expanded ? `先頭${PREVIEW_ROW_COUNT}行に戻す` : `すべて表示（全${rows.length}行）`

  return (
    <div className="gg-expandable-table">
      <div
        id={tableId}
        className={`gg-probability-table-wrap gg-expandable-table-wrap ${tableWrapperClassName}`.trim()}
        tabIndex={0}
        role="region"
        aria-label={regionLabel}
      >
        {children(visibleRows)}
      </div>
      {rows.length > PREVIEW_ROW_COUNT && <div className="gg-expandable-table-controls">
        <button
          type="button"
          className="button secondary"
          aria-expanded={expanded}
          aria-controls={tableId}
          aria-label={`${regionLabel}：${toggleLabel}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {toggleLabel}
        </button>
      </div>}
    </div>
  )
}
