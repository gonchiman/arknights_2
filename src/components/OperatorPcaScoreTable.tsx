import { useMemo, useState } from 'react'
import type { OperatorPcaPoint } from '../lib/operatorPca'
import { OperatorDetailLink, type OpenOperatorDetail } from './OperatorDetailLink'
import { TableSortHeader, type TableSort } from './TableSortHeader'

const PAGE_SIZE = 12
type ScoreSortKey = 'operator' | number

interface Props {
  points: readonly OperatorPcaPoint[]
  componentCount: number
  page: number
  onPageChange: (page: number) => void
  onOpenOperatorDetail?: OpenOperatorDetail
}

const signed = (value: number) => Math.abs(value) < 0.0005 ? '0.000' : `${value > 0 ? '+' : ''}${value.toFixed(3)}`

export function OperatorPcaScoreTable({ points, componentCount, page, onPageChange, onOpenOperatorDetail }: Props) {
  const [sort, setSort] = useState<TableSort<ScoreSortKey>>({ key: 0, direction: 'desc' })
  const activeSort: TableSort<ScoreSortKey> = typeof sort.key === 'number' && sort.key >= componentCount
    ? (componentCount > 0 ? { key: 0, direction: 'desc' } : { key: 'operator', direction: 'asc' })
    : sort
  const sortKey = activeSort.key
  const sortDirection = activeSort.direction
  const ordered = useMemo(() => [...points].sort((left, right) => {
    const names = left.operator.name.localeCompare(right.operator.name, 'ja')
    const comparison = sortKey === 'operator' ? names : left.scores[sortKey] - right.scores[sortKey]
    return (sortDirection === 'asc' ? comparison : -comparison)
      || names || left.operator.operatorId.localeCompare(right.operator.operatorId)
  }), [points, sortKey, sortDirection])
  const pages = Math.ceil(ordered.length / PAGE_SIZE)
  const activePage = Math.max(0, Math.min(page, pages - 1))
  const start = activePage * PAGE_SIZE
  const visible = ordered.slice(start, start + PAGE_SIZE)
  const components = Array.from({ length: componentCount }, (_, index) => index)

  function changeSort(key: ScoreSortKey) {
    setSort({ key, direction: key === sortKey
      ? (sortDirection === 'asc' ? 'desc' : 'asc')
      : (key === 'operator' ? 'asc' : 'desc') })
    onPageChange(0)
  }

  return <>
    <div className="operator-pca-table-scroll" role="region" aria-label="オペレーターの主成分得点" tabIndex={0}>
      <table className="operator-pca-coefficients operator-pca-scores" aria-label="オペレーターの主成分得点一覧">
        <thead><tr>
          <TableSortHeader label="オペレーター" ariaLabel="オペレーターで並べ替え" sortKey="operator"
            sort={activeSort} onSort={changeSort} className={sortKey === 'operator' ? 'selected-component' : undefined} />
          <th scope="col" className="operator-pca-score-branch">職分</th>
          {components.map(component => <TableSortHeader key={component} label={`第${component + 1}主成分`}
            ariaLabel={`第${component + 1}主成分で並べ替え`} sortKey={component} sort={activeSort} onSort={changeSort}
            className={sortKey === component ? 'selected-component' : undefined} />)}
        </tr></thead>
        <tbody>
          {visible.map(({ operator, scores }) => <tr key={operator.operatorId}>
            <th scope="row" className={sortKey === 'operator' ? 'selected-component' : undefined}>
              <OperatorDetailLink className="operator-pca-score-link" operatorId={operator.operatorId}
                onOpenOperatorDetail={onOpenOperatorDetail}>{operator.name}</OperatorDetailLink>
            </th>
            <td className="operator-pca-score-branch">{operator.subProfessionName}</td>
            {components.map(component => <td key={component} className={sortKey === component ? 'selected-component' : undefined}>
              {signed(scores[component])}
            </td>)}
          </tr>)}
          {ordered.length === 0 && <tr><td colSpan={componentCount + 2} className="operator-pca-score-empty">該当するオペレーターがいません。</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="operator-pca-score-pagination">
      <span aria-live="polite">{ordered.length > 0 ? start + 1 : 0}〜{Math.min(start + PAGE_SIZE, ordered.length)} / {ordered.length}名</span>
      <div className="operator-pca-score-actions">
        <button type="button" className="button secondary" aria-label="前のオペレーター一覧"
          disabled={activePage === 0} onClick={() => onPageChange(activePage - 1)}>前へ</button>
        <button type="button" className="button secondary" aria-label="次のオペレーター一覧"
          disabled={activePage + 1 >= pages} onClick={() => onPageChange(activePage + 1)}>次へ</button>
      </div>
    </div>
  </>
}
