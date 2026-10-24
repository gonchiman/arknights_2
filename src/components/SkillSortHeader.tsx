import type { SkillDirectorySort, SkillDirectorySortKey } from '../lib/skillDirectory'
import './SkillSortHeader.css'

interface Props {
  label: string
  sortKey: SkillDirectorySortKey
  sort: SkillDirectorySort
  onSort: (key: SkillDirectorySortKey) => void
  ariaLabel?: string
}

export function SkillSortHeader({ label, sortKey, sort, onSort, ariaLabel }: Props) {
  const active = sort.key === sortKey
  const ariaSort = active
    ? (sort.direction === 'asc' ? 'ascending' : 'descending')
    : 'none'

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className="skill-sort-button" aria-label={ariaLabel} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="skill-sort-indicator" aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}
