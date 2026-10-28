import type { SkillDirectorySort, SkillDirectorySortKey } from '../lib/skillDirectory'
import { TableSortHeader } from './TableSortHeader'

interface Props {
  label: string
  sortKey: SkillDirectorySortKey
  sort: SkillDirectorySort
  onSort: (key: SkillDirectorySortKey) => void
  ariaLabel?: string
}

export function SkillSortHeader(props: Props) {
  return <TableSortHeader {...props} />
}
