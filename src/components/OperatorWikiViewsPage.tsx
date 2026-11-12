import { useEffect, useMemo, useState } from 'react'
import type { OperatorDatabaseRecord } from '../lib/operatorDatabase'
import {
  buildOperatorWikiViewRows, loadOperatorWikiViewSnapshot, sortOperatorWikiViewRows,
  type OperatorWikiViewSnapshot,
} from '../lib/operatorWikiViews'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './DamageCalculator.css'
import './OperatorWikiViewsPage.css'

interface Props {
  operators: readonly OperatorDatabaseRecord[]
  loading: boolean
}

const VIEW_COLUMNS = [
  { key: 'yesterday', label: '前日', dateKey: 'yesterdayDate' },
  { key: 'today', label: '当日', dateKey: 'todayDate' },
  { key: 'total', label: '累計', dateKey: null },
] as const

type SortKey = 'name' | typeof VIEW_COLUMNS[number]['key']
type SnapshotState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; snapshot: OperatorWikiViewSnapshot }

const PAGE_SIZE = 12
const counts = new Intl.NumberFormat('ja-JP')
const day = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', month: 'numeric', day: 'numeric' })
const observedTime = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function OperatorWikiViewsPage({ operators, loading }: Props) {
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({ status: 'loading' })
  const [sort, setSort] = useState<TableSort<SortKey>>({ key: 'yesterday', direction: 'desc' })
  const [page, setPage] = useState(0)
  const snapshot = snapshotState.status === 'ready' ? snapshotState.snapshot : null

  useEffect(() => {
    const controller = new AbortController()
    loadOperatorWikiViewSnapshot(controller.signal).then(
      result => { if (!controller.signal.aborted) setSnapshotState({ status: 'ready', snapshot: result }) },
      () => { if (!controller.signal.aborted) setSnapshotState({ status: 'error' }) },
    )
    return () => controller.abort()
  }, [])

  const ordered = useMemo(
    () => sortOperatorWikiViewRows(buildOperatorWikiViewRows(operators, snapshot), sort),
    [operators, snapshot, sort],
  )
  const pages = Math.ceil(ordered.length / PAGE_SIZE)
  const activePage = Math.max(0, Math.min(page, pages - 1))
  const start = activePage * PAGE_SIZE
  const visible = ordered.slice(start, start + PAGE_SIZE)

  function changeSort(key: SortKey) {
    setSort(previous => ({
      key,
      direction: key === previous.key
        ? (previous.direction === 'asc' ? 'desc' : 'asc')
        : (key === 'name' ? 'asc' : 'desc'),
    }))
    setPage(0)
  }

  return <section className="calculator-page operator-wiki-views-page">
    <header className="page-intro"><h1>オペレーター別 Wiki 閲覧数</h1></header>
    {loading || snapshotState.status === 'loading'
      ? <p className="calculator-loading" role="status">読み込み中…</p>
      : <div className="calculator-panel">
        <div className="operator-wiki-views-meta">
          <a href="https://arknights.wikiru.jp/" target="_blank" rel="noopener noreferrer">アークナイツ攻略 Wiki</a>
          {snapshot && <span>取得 <time dateTime={snapshot.observedAt}>{observedTime.format(new Date(snapshot.observedAt))} JST</time></span>}
        </div>
        {snapshotState.status === 'error' && <p className="error-box" role="alert">Wiki 閲覧数を読み込めませんでした。</p>}
        <div className="operator-wiki-views-scroll" role="region" aria-label="Wiki 閲覧数一覧" tabIndex={0}>
          <table aria-label="オペレーター別のページ閲覧数（回）">
            <colgroup><col className="operator-wiki-views-name-column" /><col /><col />
              <col className="operator-wiki-views-total-column" /></colgroup>
            <thead><tr>
              <TableSortHeader label="オペレーター" ariaLabel="オペレーター名で並べ替え" sortKey="name"
                sort={sort} onSort={changeSort} />
              {VIEW_COLUMNS.map(({ key, label, dateKey }) => {
                const displayLabel = snapshot && dateKey ? `${label} ${day.format(new Date(snapshot[dateKey]))}` : label
                return <TableSortHeader key={key} label={displayLabel} ariaLabel={`${displayLabel}の閲覧数で並べ替え`}
                  sortKey={key} sort={sort} onSort={changeSort} />
              })}
            </tr></thead>
            <tbody>
              {visible.map(row => <tr key={row.operatorId}>
                <th scope="row" className={sort.key === 'name' ? 'operator-wiki-views-sorted' : undefined}>
                  {row.wikiUrl
                    ? <a href={row.wikiUrl} target="_blank" rel="noopener noreferrer" aria-label={`${row.name}の Wiki ページを開く`}>{row.name}</a>
                    : row.name}
                </th>
                {VIEW_COLUMNS.map(({ key }) => <td key={key} className={sort.key === key ? 'operator-wiki-views-sorted' : undefined}>
                  {row[key] === null ? <span className="operator-wiki-views-missing">未取得</span> : counts.format(row[key])}
                </td>)}
              </tr>)}
              {visible.length === 0 && <tr><td colSpan={4} className="operator-wiki-views-empty">オペレーターがいません。</td></tr>}
            </tbody>
          </table>
        </div>
        {ordered.length > 0 && <div className="operator-wiki-views-pagination">
          <span aria-live="polite">{start + 1}〜{start + visible.length} / {ordered.length}名</span>
          <div>
            <button type="button" className="button secondary" aria-label="前のオペレーター一覧"
              disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>前へ</button>
            <button type="button" className="button secondary" aria-label="次のオペレーター一覧"
              disabled={activePage + 1 >= pages} onClick={() => setPage(activePage + 1)}>次へ</button>
          </div>
        </div>}
      </div>}
  </section>
}
