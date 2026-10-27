import './SkillSortHeader.css'

export interface TableSort<Key extends string | number> {
  key: Key
  direction: 'asc' | 'desc'
}

interface Props<Key extends string | number> {
  label: string
  sortKey: Key
  sort: TableSort<Key>
  onSort: (key: Key) => void
  ariaLabel?: string
  className?: string
}

/** Shared header behavior; keep existing skill-table markup and styling intact. */
export function TableSortHeader<Key extends string | number>({ label, sortKey, sort, onSort, ariaLabel, className }: Props<Key>) {
  const active = sort.key === sortKey
  const ariaSort = active
    ? (sort.direction === 'asc' ? 'ascending' : 'descending')
    : 'none'

  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button type="button" className="skill-sort-button" aria-label={ariaLabel} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="skill-sort-indicator" aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}
