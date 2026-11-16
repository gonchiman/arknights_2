import { useEffect, useMemo, useState } from 'react'
import { WIKI_COMMENT_PERIODS, type WikiCommentPeriod } from '../lib/operatorWikiComments'
import { sortOperatorWikiMetricRows } from '../lib/operatorWikiViews'
import { TableSortHeader, type TableSort } from './TableSortHeader'
import './WikiStatsTable.css'

type SnapshotState<T> =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; snapshot: T }

export type WikiStatsRow<Metric extends string> = {
  operatorId: string
  name: string
  wikiUrl: string | null
  index?: string
  missingLabel?: 'ログなし'
  wikiLinkLabel?: string
} & Record<Metric, number | null>

export type WikiStatsPeriod = WikiCommentPeriod | 'total'

const VIEW_COLUMNS = [
  { key: 'yesterday', label: '前日', dateKey: 'yesterdayDate' },
  { key: 'today', label: '当日', dateKey: 'todayDate' },
  { key: 'total', label: '累計', dateKey: null },
] as const
const COMMENT_PERIODS = [...WIKI_COMMENT_PERIODS, { days: 'total', label: '累計' }] as const

const PAGE_SIZE = 25
const counts = new Intl.NumberFormat('ja-JP')
const day = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', month: 'numeric', day: 'numeric' })
const rangeDay = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
})
const observedTime = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function useWikiSnapshot<T>(load: (signal?: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<SnapshotState<T>>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      snapshot => { if (!controller.signal.aborted) setState({ status: 'ready', snapshot }) },
      () => { if (!controller.signal.aborted) setState({ status: 'error' }) },
    )
    return () => controller.abort()
  }, [load])
  return state
}

export function getWikiViewColumns(snapshot: { todayDate: string; yesterdayDate: string } | null) {
  return VIEW_COLUMNS.map(({ key, label, dateKey }) => ({
    key,
    label: snapshot && dateKey ? `${label} ${day.format(new Date(snapshot[dateKey]))}` : label,
    className: key === 'total' ? 'wiki-stats-total-column' : undefined,
  }))
}

export function WikiPeriodButtons({ period, onChange }: {
  period: WikiStatsPeriod
  onChange: (period: WikiStatsPeriod) => void
}) {
  return <div className="wiki-stats-period" role="group" aria-label="集計期間">
    {COMMENT_PERIODS.map(({ days, label }) => <button type="button" key={days} className="button secondary"
      aria-pressed={period === days} onClick={() => { if (period !== days) onChange(days) }}>{label}</button>)}
  </div>
}

export function WikiDateRange({ start, end }: { start: string; end: string }) {
  return <span aria-live="polite" aria-atomic="true">
    <time dateTime={start}>{rangeDay.format(new Date(start))}</time>
    {start !== end && <>〜<time dateTime={end}>{rangeDay.format(new Date(end))}</time></>}
  </span>
}

export function ObservedTime({ observedAt }: { observedAt: string }) {
  return <span>取得 <time dateTime={observedAt}>{observedTime.format(new Date(observedAt))} JST</time></span>
}

export function WikiStatsTable<Metric extends string>({
  columns, rows, ranks, defaultSort, page, onPageChange, label, tableLabel, metricLabel, linkLabel, nameColumnClass,
  subject = 'operator', provisionalRanks = false,
}: {
  columns: readonly { key: Metric; label: string; className?: string }[]
  rows: readonly WikiStatsRow<Metric>[]
  ranks: ReadonlyMap<string, number>
  defaultSort: Metric
  page: number
  onPageChange: (page: number) => void
  label: string
  tableLabel: string
  metricLabel: string
  linkLabel: string
  nameColumnClass: string
  subject?: 'operator' | 'enemy'
  provisionalRanks?: boolean
}) {
  const showIndex = subject === 'enemy'
  const rowLabel = subject === 'enemy' ? '敵' : 'オペレーター'
  const nameLabel = subject === 'enemy' ? '敵名' : 'オペレーター'
  const resultUnit = subject === 'enemy' ? '件' : '名'
  const [sort, setSort] = useState<TableSort<'name' | Metric>>({ key: defaultSort, direction: 'desc' })
  const ordered = useMemo(() => sortOperatorWikiMetricRows<Metric, WikiStatsRow<Metric>>(rows, sort), [rows, sort])
  const pages = Math.ceil(ordered.length / PAGE_SIZE)
  const activePage = Math.max(0, Math.min(page, pages - 1))
  const start = activePage * PAGE_SIZE
  const visible = ordered.slice(start, start + PAGE_SIZE)

  function changeSort(key: 'name' | Metric) {
    setSort(previous => ({
      key,
      direction: key === previous.key
        ? (previous.direction === 'asc' ? 'desc' : 'asc')
        : (key === 'name' ? 'asc' : 'desc'),
    }))
    onPageChange(0)
  }

  return <>
    <div className="wiki-stats-scroll" role="region" aria-label={label} tabIndex={0}>
      <table aria-label={tableLabel} className={showIndex ? 'wiki-stats-indexed-table' : undefined}>
        <colgroup><col className="wiki-stats-rank-column" />
          {showIndex && <col className="wiki-stats-index-column" />}
          <col className={nameColumnClass} />
          {columns.map(column => <col key={column.key} className={column.className} />)}
        </colgroup>
        <thead><tr>
          <th scope="col" className="wiki-stats-rank">{provisionalRanks ? '暫定順位' : '累計順位'}</th>
          {showIndex && <th scope="col" className="wiki-stats-index">図鑑番号</th>}
          <TableSortHeader label={nameLabel} ariaLabel={`${rowLabel}名で並べ替え`} sortKey="name" sort={sort} onSort={changeSort} />
          {columns.map(column => <TableSortHeader key={column.key} label={column.label}
            ariaLabel={`${column.label === metricLabel ? metricLabel : `${column.label}の${metricLabel}`}で並べ替え`}
            sortKey={column.key} sort={sort} onSort={changeSort} />)}
        </tr></thead>
        <tbody>
          {visible.map(row => <tr key={row.operatorId}>
            <td className="wiki-stats-rank">{ranks.get(row.operatorId) ?? '—'}</td>
            {showIndex && <td className="wiki-stats-index">{row.index ?? '—'}</td>}
            <th scope="row" className={sort.key === 'name' ? 'wiki-stats-sorted' : undefined}>
              {row.wikiUrl
                ? <a href={row.wikiUrl} target="_blank" rel="noopener noreferrer" aria-label={`${row.name}の ${row.wikiLinkLabel ?? linkLabel}を開く`}>{row.name}</a>
                : row.name}
            </th>
            {columns.map(({ key }) => {
              const count = row[key]
              return <td key={key} className={sort.key === key ? 'wiki-stats-sorted' : undefined}>
                {count === null ? <span className="wiki-stats-missing">{row.missingLabel ?? '未取得'}</span> : counts.format(count)}
              </td>
            })}
          </tr>)}
          {visible.length === 0 && <tr>
            <td colSpan={columns.length + (showIndex ? 3 : 2)} className="wiki-stats-empty">
              <span role="status">該当する{rowLabel}がいません。</span>
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
    {ordered.length > 0 && <div className="wiki-stats-pagination">
      <span aria-live="polite">{start + 1}〜{start + visible.length} / {ordered.length}{resultUnit}</span>
      <div>
        <button type="button" className="button secondary" aria-label={`前の${rowLabel}一覧`}
          disabled={activePage === 0} onClick={() => onPageChange(activePage - 1)}>前へ</button>
        <button type="button" className="button secondary" aria-label={`次の${rowLabel}一覧`}
          disabled={activePage + 1 >= pages} onClick={() => onPageChange(activePage + 1)}>次へ</button>
      </div>
    </div>}
  </>
}
